import { ref } from "vue";
import type { Dict } from "@/types/dict.type";
import type { DebugOption, MachineConfig } from "@/types/machine.interface";
import type { IBus, MachineStateSpec } from "@/virtualmachine/cpu/bus.interface";
import {
	FLAG_B_MASK,
	FLAG_C_MASK,
	FLAG_D_MASK,
	FLAG_I_MASK,
	FLAG_N_MASK,
	FLAG_V_MASK,
	FLAG_Z_MASK,
	MEMORY_OFFSET,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_SPEED_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
	STACK_METADATA_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import { VideoOutput } from "@/virtualmachine/video/video.output";
import { useMemoryMap } from "../composables/useMemoryMap";
import { parseHexData } from "../lib/array.utils";
import type { Breakpoint } from "../types/breakpoint.interface";
import type { EmulatorState } from "../types/emulatorstate.interface";

const HYPERCALL_COMMANDS = new Set([0x01, 0x02, 0x03]);

const MACHINES_BASE_PATH = "../machines";
const busModules = import.meta.glob("../machines/*/*.bus.ts");
const cssModules = import.meta.glob("../machines/**/*.css");

const kbdElements = new Set<string>(["INPUT", "TEXTAREA", "SELECT"]);

// 1. Initialize AudioContext (Must be created after a user gesture like a click)
let audioCtx: AudioContext | null = null;
let nextStartTime = 0;

export class VirtualMachine {
	public sharedBuffer: SharedArrayBuffer;
	public sharedRegisters: DataView;
	public sharedStackMetadata: Uint8Array;
	public sharedMemory: Uint8Array;
	public videoBuffer?: SharedArrayBuffer;
	public videoMemory?: Uint8Array;
	private videoOutput?: VideoOutput;
	private pendingPalette: Uint8Array | null = null;
	public busState: Dict = {};
	private isRendering = false;
	private _isRunning = false;

	public worker: Worker;
	public machineConfig: MachineConfig;
	public bus?: IBus;
	public ready: Promise<void>;

	private workerReadyPromise: Promise<void>;
	private resolveWorkerReady!: () => void;

	public onmessage?: (event: MessageEvent) => void;
	public onStateChange?: (state: Dict) => void;
	public onTraceReceived?: (history: { type: string; source: number; target: number }[]) => void;
	public onLog?: (log: Dict) => void;

	public isTraceEnabled = false;
	public symbolsVersion = ref(0);
	public traceOverflow = ref(false);
	private lastTraceHead = "";
	private tracePollInterval: number | undefined;

	private keyHandler = this.handleKeyDown.bind(this);
	private keyUpHandler = this.handleKeyUp.bind(this);
	private pasteHandler = this.handlePaste.bind(this);

	constructor(machineConfig: MachineConfig) {
		this.machineConfig = machineConfig;

		if (this.machineConfig.regions) {
			const { addRegion } = useMemoryMap();
			this.machineConfig.regions.forEach((region) => {
				addRegion(region);
			});
		}

		this.worker = new Worker(new URL("./cpu/cpu.worker.ts", import.meta.url), { type: "module" });

		this.workerReadyPromise = new Promise<void>((resolve) => {
			this.resolveWorkerReady = resolve;
		});

		this.worker.onmessage = (event) => {
			const { command, colors, type, history, buffer, payload, address } = event.data;

			switch (type) {
				case "audio":
					this.queueAudioChunk(buffer);
					break;
				case "ready":
					this.resolveWorkerReady();
					break;
				case "trace":
					this.handleTraceReceived(history);
					break;
				case "log":
					this.onLog?.(payload);
					break;
				case "isRunning":
					this._isRunning = event.data.isRunning;
					this.onmessage?.(event);
					break;
				case "break": {
					// It's a BRK instruction. Check for hypercalls.
					const hypercallCommand = this.read(address + 1);
					if (HYPERCALL_COMMANDS.has(hypercallCommand)) this.executeHypercallCmd(hypercallCommand, address);
					break;
				}
				case "breakpointHit":
					this.onmessage?.(event);
					break;
				default:
					if (command === "setPalette") {
						if (this.videoOutput) this.videoOutput.setPalette(colors);
						else this.pendingPalette = colors;
					} else {
						this.onmessage?.(event);
					}
					break;
			}
		};

		// 1. Initialize memory on the main thread
		const bufferSize = MEMORY_OFFSET + this.machineConfig.memory.size;

		this.sharedBuffer = new SharedArrayBuffer(bufferSize);
		this.sharedRegisters = new DataView(this.sharedBuffer, 0, MEMORY_OFFSET);
		this.sharedStackMetadata = new Uint8Array(this.sharedBuffer, STACK_METADATA_OFFSET, 256);
		this.sharedMemory = new Uint8Array(this.sharedBuffer, MEMORY_OFFSET, this.machineConfig.memory.size);

		if (this.machineConfig.video) {
			const videoSize = this.machineConfig.video.width * this.machineConfig.video.height;
			this.videoBuffer = new SharedArrayBuffer(videoSize);
			this.videoMemory = new Uint8Array(this.videoBuffer, 0, videoSize);
		}

		// 2. Load data into memory from the main thread
		this.sharedMemory.fill(0);
		this.sharedStackMetadata.fill(0);

		this.loadCSS();
		this.ready = this.loadBus();
	}

	private async loadCSS() {
		const cssFiles = this.machineConfig.css;
		if (!cssFiles) return;
		for (const file of cssFiles) {
			const key = `${MACHINES_BASE_PATH}/${file}`;
			const loader = cssModules[key];
			if (loader) {
				await loader();
				console.log(`VM: Loaded CSS ${key}`);

				const isFontLoaded = document.fonts.check("16px PrintChar21");
				console.log("Font loaded:", isFontLoaded);
				if (!isFontLoaded) {
					await document.fonts.load("16px PrintChar21");
				}
			} else {
				console.warn(`VM: CSS module not found: ${key}`);
			}
		}
	}

	private async loadBus() {
		const busConfig = this.machineConfig.bus;
		const busModuleKey = `${MACHINES_BASE_PATH}/${busConfig.path}.ts`;
		const busModuleLoader = busModules[busModuleKey];
		if (!busModuleLoader) {
			console.error(`VM: Could not find a bus module loader for key: ${busModuleKey}`);
			return;
		}
		const BusModule = await busModuleLoader();
		const exportedBusEntry = Object.entries(BusModule as object).find(([name]) => name === busConfig.class);
		if (!exportedBusEntry) {
			console.error(`VM: Could not find class ${busConfig.class} for module ${busModuleKey}`);
			return;
		}
		const [, BusClass]: [unknown, new (mem: Uint8Array) => IBus] = exportedBusEntry;
		this.bus = new BusClass(this.sharedMemory);
		console.log(`VM: Bus ${busConfig.class} loaded on main thread.`);

		// 3. Prepare worker payloads (if any)
		let payloads: { video?: unknown; bus?: unknown } = {};
		if (this.bus.prepareWorkerPayloads) {
			payloads = await this.bus.prepareWorkerPayloads();
		}

		// 4. Initialize the worker with the prepared buffer, config, and payloads
		const chunks = this.machineConfig.memory.chunks?.map((chunk) => ({
			...chunk,
			data: typeof chunk.data === "string" ? parseHexData(chunk.data) : chunk.data,
		}));

		this.worker.postMessage({
			command: "init",
			machine: {
				name: this.machineConfig.name,
				bus: {
					path: this.machineConfig.bus.path,
					class: this.machineConfig.bus.class,
					payload: payloads.bus,
				},
				video: {
					width: this.machineConfig.video?.width,
					height: this.machineConfig.video?.height,
					path: this.machineConfig.video?.path,
					class: this.machineConfig.video?.class,
					buffer: this.videoBuffer,
					payload: payloads.video,
				},
				memory: { buffer: this.sharedBuffer, size: this.machineConfig.memory.size, chunks },
				disk: { ...this.machineConfig.disk },
			},
		});

		this.setSpeed(this.machineConfig.speed ?? 1);
		await this.workerReadyPromise;
	}

	public initVideo(canvas: HTMLCanvasElement) {
		if (!this.machineConfig.video || !this.videoMemory) {
			console.warn("This machine does not have video output.");
			return;
		}
		this.videoOutput = new VideoOutput(
			canvas,
			this.videoMemory,
			this.machineConfig.video.width,
			this.machineConfig.video.height,
		);

		if (this.pendingPalette) {
			this.videoOutput.setPalette(this.pendingPalette);
			this.pendingPalette = null;
		}

		// Attach keyboard listener
		window.addEventListener("keydown", this.keyHandler);
		window.addEventListener("keyup", this.keyUpHandler);
		window.addEventListener("paste", this.pasteHandler);

		this.isRendering = true;
		this.renderFrame();
	}

	public async initAudio() {
		if (!audioCtx) audioCtx = new AudioContext({ sampleRate: 22050 });
		if (audioCtx.state === "suspended") {
			await audioCtx.resume();
		}

		// Use main thread audio instead of AudioWorklet
		// Audio will be sent from worker and played here
		this.worker.postMessage({ command: "initAudio", sampleRate: audioCtx.sampleRate });
	}

	private handleKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target && (kbdElements.has(target.tagName) || target.isContentEditable)) return;

		// Debugger Shortcuts
		if (event.code === "F10") {
			event.preventDefault();
			this.stepOver();
			return;
		}
		if (event.code === "F11") {
			event.preventDefault();
			if (event.shiftKey) this.stepOut();
			else this.step();
			return;
		}
		if (event.code === "F5") {
			event.preventDefault();
			if (this._isRunning) this.pause();
			else this.play();
			return;
		}

		this.worker.postMessage({
			command: "keydown",
			key: event.key,
			code: event.code,
			ctrl: event.ctrlKey,
			shift: event.shiftKey,
			alt: event.altKey,
			meta: event.metaKey,
		});

		// Prevent default browser actions for handled keys (except F-keys, etc)
		if (!event.metaKey && (!event.altKey || event.key === "Alt")) {
			if (
				event.key.length === 1 ||
				["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace", "Enter"].includes(event.key)
			) {
				event.preventDefault();
			}
		}
	}

	private handleKeyUp(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target && (kbdElements.has(target.tagName) || target.isContentEditable)) return;

		this.worker.postMessage({ command: "keyup", key: event.key, code: event.code });
	}

	private handlePaste(event: ClipboardEvent) {
		const target = event.target as HTMLElement;
		if (target && (kbdElements.has(target.tagName) || target.isContentEditable)) return;

		const text = event.clipboardData?.getData("text");
		if (text) {
			event.preventDefault();
			this.typeText(text);
		}
	}

	public async typeText(text: string) {
		const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		for (const char of normalized) {
			if (!this.isRendering) break;
			let key = char;
			if (char === "\n") key = "Enter";

			this.worker.postMessage({ command: "keydown", key });
			await new Promise((resolve) => setTimeout(resolve, 5));
			this.worker.postMessage({ command: "keyup", key });
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
	}

	private handleTraceReceived(history: { type: string; source: number; target: number }[]) {
		const newHead = history.length > 0 ? JSON.stringify(history[0]) : "";
		this.traceOverflow.value = !!this.lastTraceHead && !!newHead && this.lastTraceHead !== newHead;
		this.lastTraceHead = newHead;
		this.onTraceReceived?.(history);
	}

	public syncBusState() {
		if (this.bus?.readStateFromBuffer) {
			const state = this.bus.readStateFromBuffer(this.sharedRegisters);
			if (this.bus.loadState) this.bus.loadState(state);
			this.busState = state;
			this.onStateChange?.(state);
		}
	}

	private renderFrame() {
		if (!this.isRendering) return;
		this.syncBusState();
		this.videoOutput?.render();
		requestAnimationFrame(() => this.renderFrame());
	}

	private queueAudioChunk(samples: Float32Array) {
		if (!audioCtx) return;

		// Ensure context is running (browsers suspend it until user interaction)
		if (audioCtx.state === "suspended") audioCtx.resume();

		const audioBuffer = audioCtx.createBuffer(1, samples.length, audioCtx.sampleRate);
		audioBuffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);

		const source = audioCtx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(audioCtx.destination);

		// --- Scheduling Logic ---
		const currentTime = audioCtx.currentTime;

		// If nextStartTime is in the past, reset it to now. This can happen
		// if there was a gap in audio data, preventing runaway playback.
		if (nextStartTime < currentTime) nextStartTime = currentTime;

		source.start(nextStartTime);

		// Schedule the next chunk to start right after this one finishes
		nextStartTime += audioBuffer.duration;
	}

	public setSpeed = (speed: number) => this.worker.postMessage({ command: "setSpeed", speed });
	public getSpeed = () => this.sharedRegisters.getFloat64(REG_SPEED_OFFSET, true);
	public setBreakOnBrk = (enabled: boolean) => this.worker.postMessage({ command: "setBreakOnBrk", enabled });
	public resetCPU = () => this.worker.postMessage({ command: "reset" });
	public play = () => this.worker.postMessage({ command: "run" });
	public pause = () => this.worker.postMessage({ command: "pause" });
	public reset = () => this.worker.postMessage({ command: "reset" });
	public step = () => this.worker.postMessage({ command: "step" });
	public stepOut = () => this.worker.postMessage({ command: "stepOut" });
	public stepOver = () => this.worker.postMessage({ command: "stepOver" });

	public addBP = (type: Breakpoint["type"], address: number, endAddress?: number) =>
		this.worker.postMessage({ command: "addBP", type, address, endAddress });
	public removeBP = (type: Breakpoint["type"], address: number, endAddress?: number) =>
		this.worker.postMessage({ command: "removeBP", type, address, endAddress });
	public clearBPs = () => this.worker.postMessage({ command: "clearBPs" });

	public addSymbols = (newSymbols: Dict) => {
		if (!this.machineConfig.symbols) this.machineConfig.symbols = {};
		Object.assign(this.machineConfig.symbols, newSymbols);
		// Trigger reactivity for consumers (like DisassemblyView)
		this.symbolsVersion.value++;
	};

	public insertDisk = (data: Uint8Array, metadata: Dict = {}) =>
		this.worker.postMessage({ command: "insertMedia", data, metadata });

	public setTrace = (enabled: boolean) => {
		this.isTraceEnabled = enabled;
		this.worker.postMessage({ command: "setTrace", enabled });
		if (enabled) {
			this.startTracePolling();
		} else {
			this.stopTracePolling();
			this.traceOverflow.value = false;
			this.lastTraceHead = "";
		}
	};

	private startTracePolling() {
		if (this.tracePollInterval) return;
		this.tracePollInterval = window.setInterval(() => this.getTrace(), 1000);
	}

	private stopTracePolling() {
		if (this.tracePollInterval) {
			clearInterval(this.tracePollInterval);
			this.tracePollInterval = undefined;
		}
	}

	public setTraceSize = (size: number) => this.worker.postMessage({ command: "setTraceSize", size });
	public getTrace = () => this.worker.postMessage({ command: "getTrace" });
	public clearTrace = () => {
		this.worker.postMessage({ command: "clearTrace" });
		this.traceOverflow.value = false;
		this.lastTraceHead = "";
	};
	public refreshVideo = () => this.worker.postMessage({ command: "refreshVideo" });
	public mute = (enabled: boolean) => this.worker.postMessage({ command: "mute", enabled });
	public testVideo = (mode: string) => this.worker.postMessage({ command: "testVideo", mode });

	public read(address: number): number {
		return this.bus ? this.bus.read(address) : (this.sharedMemory[address] ?? 0);
	}

	public getScope(address: number): string {
		return this.bus?.getScope ? this.bus.getScope(address) : "main";
	}

	public readDebug(address: number, overrides?: Dict): number {
		return this.bus?.readDebug ? this.bus.readDebug(address, overrides) : this.read(address);
	}

	public writeDebug(address: number, value: number, overrides?: Dict) {
		if (this.bus?.writeDebug) this.bus.writeDebug(address, value, overrides);
		else this.updateMemory(address, value);
	}

	public setDebugOverrides(category: string, overrides: Dict) {
		this.worker.postMessage({ command: "setDebugOverrides", category, overrides: { ...overrides } });
	}

	public updateMemory(addr: number, value: number) {
		if (this.bus) this.bus.write(addr, value);
		else this.sharedMemory[addr] = value;
	}

	public updateRegister(reg: keyof EmulatorState["registers"], value: number) {
		switch (reg) {
			case "A":
				this.sharedRegisters.setUint8(REG_A_OFFSET, value);
				break;
			case "X":
				this.sharedRegisters.setUint8(REG_X_OFFSET, value);
				break;
			case "Y":
				this.sharedRegisters.setUint8(REG_Y_OFFSET, value);
				break;
			case "SP":
				this.sharedRegisters.setUint8(REG_SP_OFFSET, value);
				break;
			case "PC":
				this.sharedRegisters.setUint16(REG_PC_OFFSET, value, true);
				break;
			case "P": {
				// This handles setting the entire status register from a single byte value.
				// The B flag (bit 4) and the unused flag (bit 5) are typically not modified this way.
				// We'll preserve them from the current status.
				const currentStatus = this.sharedRegisters.getUint8(REG_STATUS_OFFSET);
				const newStatus = (value & ~0x30) | (currentStatus & 0x30);
				this.sharedRegisters.setUint8(REG_STATUS_OFFSET, newStatus);
				break;
			}
			case "N":
			case "V":
			case "B": // Note: B is often read-only, but we allow toggling for debugging.
			case "D":
			case "I":
			case "Z":
			case "C": {
				const flagMasks = {
					N: FLAG_N_MASK,
					V: FLAG_V_MASK,
					B: FLAG_B_MASK,
					D: FLAG_D_MASK,
					I: FLAG_I_MASK,
					Z: FLAG_Z_MASK,
					C: FLAG_C_MASK,
				};
				const mask = flagMasks[reg];
				let status = this.sharedRegisters.getUint8(REG_STATUS_OFFSET);
				if (value) status |= mask;
				else status &= ~mask;
				this.sharedRegisters.setUint8(REG_STATUS_OFFSET, status);
				break;
			}
		}
	}

	public getDebugOptions(): DebugOption[] {
		return this.machineConfig.debugOptions ?? (this.bus?.getDebugOptions ? this.bus.getDebugOptions() : []);
	}

	public getMachineStateSpecs(): MachineStateSpec[] {
		return this.bus?.getMachineStateSpecs ? this.bus.getMachineStateSpecs() : [];
	}

	private readString(address: number): string {
		let message = "";
		let charAddr = address;
		let charCode = this.read(charAddr);
		// Safety break at 256 chars to prevent infinite loops on unterminated strings
		while (charCode !== 0 && message.length < 256) {
			message += String.fromCharCode(charCode & 0x7f);
			charAddr++;
			charCode = this.read(charAddr);
		}
		return message;
	}

	private executeHypercallCmd(hypercallCommand: number, pc: number) {
		let offsetPC = 0;
		switch (hypercallCommand) {
			case 0x01: {
				// LOG_STRING
				// Read the 16-bit address of the string from PC+2 and PC+3
				const stringAddr = this.read(pc + 2) | (this.read(pc + 3) << 8);
				const message = this.readString(stringAddr);

				// Log the message
				// this.onLog?.({ message: `GUEST: ${message}` });
				console.log("VM: LOG_STRING:", message);

				// Advance PC past the BRK and its arguments (BRK, CMD, ADDR_LO, ADDR_HI)
				offsetPC = 4;
				break;
			}

			case 0x02: {
				// LOG_REGS
				const A = this.sharedRegisters.getUint8(REG_A_OFFSET);
				const X = this.sharedRegisters.getUint8(REG_X_OFFSET);
				const Y = this.sharedRegisters.getUint8(REG_Y_OFFSET);
				const SP = this.sharedRegisters.getUint8(REG_SP_OFFSET);
				const P = this.sharedRegisters.getUint8(REG_STATUS_OFFSET);

				const message = `A:${A.toString(16).padStart(2, "0")} X:${X.toString(16).padStart(2, "0")} Y:${Y.toString(16).padStart(2, "0")} P:${P.toString(16).padStart(2, "0")} SP:${SP.toString(16).padStart(2, "0")}`;
				// this.onLog?.({ message: `GUEST_REGS: ${message}` });
				console.log("VM: LOG_REGS:", message);

				// Advance PC past BRK and command byte
				offsetPC = 2;

				break;
			}

			case 0x03: {
				// ADD_REGION
				// Format: BRK $03 <Start:word> <Size:word> <NamePtr:word> <Bank:word>
				const start = this.read(pc + 2) | (this.read(pc + 3) << 8);
				const size = this.read(pc + 4) | (this.read(pc + 5) << 8);
				const namePtr = this.read(pc + 6) | (this.read(pc + 7) << 8);
				const bank = this.read(pc + 8) | (this.read(pc + 9) << 8);

				const name = this.readString(namePtr);

				const { addRegion } = useMemoryMap();
				addRegion({ name, start, size, bank, removable: true });

				console.log(`VM: ADD_REGION: ${name} @ $${start.toString(16)} size $${size.toString(16)}`);

				offsetPC = 10;
				break;
			}
		}

		console.log(`VM: PC = $${(pc + offsetPC).toString(16)}`);

		this.updateRegister("PC", pc + offsetPC);
		this.play();
	}

	public terminate() {
		this.isRendering = false;
		this.worker.terminate();
		window.removeEventListener("keydown", this.keyHandler);
		window.removeEventListener("keyup", this.keyUpHandler);
		window.removeEventListener("paste", this.pasteHandler);
		console.log("VM: Worker terminated.");
	}
}
