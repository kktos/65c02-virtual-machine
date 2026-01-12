import type { MachineConfig } from "@/types/machine.interface";
import type { DebugOption, IBus, MachineStateSpec } from "@/virtualmachine/cpu/bus.interface";
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
} from "@/virtualmachine/cpu/shared-memory";
import { VideoOutput } from "@/virtualmachine/video/video.output";
import { parseHexData } from "../lib/array.utils";
import type { Breakpoint } from "../types/breakpoint.interface";
import type { EmulatorState } from "../types/emulatorstate.interface";

const MachinesBasePath = "../machines";
const busModules = import.meta.glob("../machines/*/*.bus.ts");
const cssModules = import.meta.glob("../machines/**/*.css");
const kbdElements = new Set<string>(["INPUT", "TEXTAREA", "SELECT"]);

// 1. Initialize AudioContext (Must be created after a user gesture like a click)
let audioCtx: AudioContext | null = null;
let nextStartTime = 0;

export class VirtualMachine {
	public sharedBuffer: SharedArrayBuffer;
	public sharedRegisters: DataView;
	public sharedMemory: Uint8Array;
	public videoBuffer?: SharedArrayBuffer;
	public videoMemory?: Uint8Array;
	private videoOutput?: VideoOutput;
	private pendingPalette: Uint8Array | null = null;
	public busState: Record<string, unknown> = {};
	private isRendering = false;

	public worker: Worker;
	public machineConfig: MachineConfig;
	public bus?: IBus;
	public ready: Promise<void>;

	private workerReadyPromise: Promise<void>;
	private resolveWorkerReady!: () => void;

	public onmessage?: (event: MessageEvent) => void;
	public onStateChange?: (state: Record<string, unknown>) => void;
	public onTraceReceived?: (history: { type: string; source: number; target: number }[]) => void;

	private keyHandler = this.handleKeyDown.bind(this);
	private keyUpHandler = this.handleKeyUp.bind(this);

	constructor(machineConfig: MachineConfig) {
		this.machineConfig = machineConfig;
		this.worker = new Worker(new URL("./cpu/cpu.worker.ts", import.meta.url), { type: "module" });

		this.workerReadyPromise = new Promise<void>((resolve) => {
			this.resolveWorkerReady = resolve;
		});

		this.worker.onmessage = (event) => {
			const { command, colors, type, history, buffer } = event.data;
			if (type === "audio") {
				this.queueAudioChunk(buffer);
			} else if (command === "setPalette") {
				if (this.videoOutput) this.videoOutput.setPalette(colors);
				else this.pendingPalette = colors;
			} else if (type === "ready") {
				this.resolveWorkerReady();
			} else if (type === "trace") {
				this.onTraceReceived?.(history);
			} else if (this.onmessage) {
				this.onmessage(event);
			}
		};

		// 1. Initialize memory on the main thread
		const bufferSize = MEMORY_OFFSET + this.machineConfig.memory.size;

		this.sharedBuffer = new SharedArrayBuffer(bufferSize);
		this.sharedRegisters = new DataView(this.sharedBuffer, 0, MEMORY_OFFSET);
		this.sharedMemory = new Uint8Array(this.sharedBuffer, MEMORY_OFFSET, this.machineConfig.memory.size);

		if (this.machineConfig.video) {
			const videoSize = this.machineConfig.video.width * this.machineConfig.video.height;
			this.videoBuffer = new SharedArrayBuffer(videoSize);
			this.videoMemory = new Uint8Array(this.videoBuffer, 0, videoSize);
		}

		// 2. Load data into memory from the main thread
		this.sharedMemory.fill(0);

		this.loadCSS();
		this.ready = this.loadBus();
	}

	private async loadCSS() {
		const cssFiles = this.machineConfig.css;
		if (!cssFiles) return;
		for (const file of cssFiles) {
			const key = `${MachinesBasePath}/${file}`;
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
		const busModuleKey = `${MachinesBasePath}/${busConfig.path}.ts`;
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
		if (audioCtx.state === "suspended") {
			audioCtx.resume();
		}

		const audioBuffer = audioCtx.createBuffer(1, samples.length, audioCtx.sampleRate);
		audioBuffer.copyToChannel(samples, 0);

		const source = audioCtx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(audioCtx.destination);

		// --- Scheduling Logic ---
		const currentTime = audioCtx.currentTime;

		// If nextStartTime is in the past, reset it to now. This can happen
		// if there was a gap in audio data, preventing runaway playback.
		if (nextStartTime < currentTime) {
			nextStartTime = currentTime;
		}

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

	public addBP(type: Breakpoint["type"], address: number, endAddress?: number) {
		this.worker.postMessage({ command: "addBP", type, address, endAddress });
	}
	public removeBP(type: Breakpoint["type"], address: number, endAddress?: number) {
		this.worker.postMessage({ command: "removeBP", type, address, endAddress });
	}
	public clearBPs() {
		this.worker.postMessage({ command: "clearBPs" });
	}

	public insertDisk(data: Uint8Array, metadata: Record<string, unknown> = {}) {
		this.worker.postMessage({ command: "insertMedia", data, metadata });
	}

	public setTrace = (enabled: boolean) => this.worker.postMessage({ command: "setTrace", enabled });
	public getTrace = () => this.worker.postMessage({ command: "getTrace" });
	public clearTrace = () => this.worker.postMessage({ command: "clearTrace" });
	public refreshVideo = () => this.worker.postMessage({ command: "refreshVideo" });

	public read(address: number): number {
		return this.bus ? this.bus.read(address) : (this.sharedMemory[address] ?? 0);
	}

	public readDebug(address: number, overrides?: Record<string, unknown>): number {
		return this.bus?.readDebug ? this.bus.readDebug(address, overrides) : this.read(address);
	}

	public writeDebug(address: number, value: number, overrides?: Record<string, unknown>) {
		if (this.bus?.writeDebug) {
			this.bus.writeDebug(address, value, overrides);
		} else {
			this.updateMemory(address, value);
		}
	}

	public setDebugOverrides(overrides: Record<string, unknown>) {
		this.worker.postMessage({ command: "setDebugOverrides", overrides: { ...overrides } });
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

	public terminate() {
		this.isRendering = false;
		this.worker.terminate();
		window.removeEventListener("keydown", this.keyHandler);
		window.removeEventListener("keyup", this.keyUpHandler);
		console.log("VM: Worker terminated.");
	}
}
