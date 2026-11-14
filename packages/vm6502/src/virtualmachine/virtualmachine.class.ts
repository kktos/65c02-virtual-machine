import { ref } from "vue";
import type { TraceSnapshot } from "./cpu/instructionTrace";
import type { SaveStateInfo, SaveStateMeta } from "./cpu/saveStates";
import type { Dict } from "@/types/dict.type";
import type { MachineConfig, MemoryChunk } from "@/types/machine.interface";
import type { IBus, KeyboardState } from "@/types/bus.interface";
import {
	FLAG_B_MASK,
	FLAG_C_MASK,
	FLAG_D_MASK,
	FLAG_I_MASK,
	FLAG_N_MASK,
	FLAG_V_MASK,
	FLAG_Z_MASK,
	INPUT_ANALOG_0_OFFSET,
	INPUT_DIGITAL_OFFSET,
	MAX_ANALOG_INPUTS,
	MEMORY_OFFSET,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_SPEED_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
	readRegisters,
	STACK_METADATA_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import {
	cropVideoBuffer,
	grayscalePalette,
	VideoOutput,
	type VideoViewRect,
} from "@/virtualmachine/video/video.output";
import { useMemoryMap } from "../composables/useMemoryMap";
import { parseHexData } from "../lib/array.utils";
import type { Breakpoint } from "../types/breakpoint.interface";
import { applyHypercall } from "./hypercall";
import type { StepResult, StopInfo } from "@/types/stopinfo.interface";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import { logBus } from "./logbus.class";
import { encodeIndexedPng } from "@/lib/png.lib";

const MACHINES_BASE_PATH = "../machines";
const busModules = import.meta.glob("../machines/*/*.bus.ts");
const cssModules = import.meta.glob("../machines/**/*.css");

const kbdElements = new Set<string>(["INPUT", "TEXTAREA", "SELECT"]);

// 1. Initialize AudioContext (Must be created after a user gesture like a click)
let audioCtx: AudioContext | null = null;
let nextStartTime = 0;
// The sound queued ahead is kept between these (seconds): enough to absorb the jitter of the worker's
// messages, never a growing lag (the main thread busy, the clock of the worker drifting from the audio's).
const AUDIO_PREBUFFER = 0.03;
const AUDIO_MAX_LATENCY = 0.15;

/** A memory chunk's bytes: its `data` (hex text parsed), or its `src` file fetched. */
async function chunkData(chunk: MemoryChunk): Promise<Uint8Array> {
	if (chunk.src === undefined)
		return typeof chunk.data === "string" ? parseHexData(chunk.data) : (chunk.data ?? new Uint8Array());
	const url = new URL(chunk.src, document.baseURI);
	const response = await fetch(url).catch(() => undefined);
	// The dev server answers a missing file with index.html
	if (!response?.ok || response.headers.get("content-type")?.includes("text/html"))
		throw new Error(`Missing ROM file ${chunk.src}`);
	const data = new Uint8Array(await response.arrayBuffer());
	if (chunk.size !== undefined && data.length !== chunk.size)
		throw new Error(`${chunk.src}: ${data.length} bytes, expected ${chunk.size}`);
	return data;
}

/** The screen as a PNG image of `width` x `height` pixels. */
export type Screenshot = { width: number; height: number; png: Uint8Array };

export class VirtualMachine {
	public sharedBuffer: SharedArrayBuffer;
	public sharedRegisters: DataView;
	public sharedStackMetadata: Uint8Array;
	public sharedMemory: Uint8Array;
	public videoBuffer?: SharedArrayBuffer;
	public videoMemory?: Uint8Array;
	private videoOutput?: VideoOutput;
	// The palette and the visible part of the video buffer, as last sent by the machine's video.
	// They can arrive before the canvas is attached (applied in initVideo); screenshot uses them too.
	private palette: Uint8Array | null = null;
	private viewRect: VideoViewRect | null = null;
	// The video options can arrive before the canvas is attached; kept here and applied in initVideo
	private integerScaling = false;
	public busState: Dict = {};
	private isRendering = false;
	private _isRunning = false;
	// `play()` was sent and the worker hasn't said it runs yet: the machine is about to run
	private _playPending = false;
	private _lastStop?: StopInfo;

	public worker: Worker;
	public machineConfig: MachineConfig;
	public bus?: IBus;
	public ready: Promise<void>;

	private workerReadyPromise: Promise<void>;
	private resolveWorkerReady!: () => void;

	public onmessage?: (event: MessageEvent) => void;
	public onStateChange?: (state: Dict) => void;
	public onTraceReceived?: (history: { type: string; source: number; target: number }[]) => void;

	public isTraceEnabled = false;
	public traceOverflow = ref(false);
	/** Width / height of the displayed frame (the view rect): the app layout sizes the video area from it */
	public videoAspect = ref(4 / 3);
	private lastTraceHead = "";
	private tracePollInterval: number | undefined;

	private keyHandler = this.handleKeyDown.bind(this);
	private keyUpHandler = this.handleKeyUp.bind(this);
	private pasteHandler = this.handlePaste.bind(this);
	// The page loses the focus: the keyup of the keys down won't come
	private blurHandler = () => this.worker.postMessage({ command: "keyup" });

	private stateStack: number[][] = [];

	constructor(machineConfig: MachineConfig) {
		this.machineConfig = machineConfig;
		if (machineConfig.video) this.videoAspect.value = machineConfig.video.width / machineConfig.video.height;

		const { addRegion, clearRegions } = useMemoryMap();
		clearRegions();

		if (this.machineConfig.regions) {
			this.machineConfig.regions.forEach((region) => {
				addRegion(region);
			});
		}

		this.worker = new Worker(new URL("./cpu/cpu.worker.ts", import.meta.url), {
			type: "module",
		});

		this.workerReadyPromise = new Promise<void>((resolve) => {
			this.resolveWorkerReady = resolve;
		});

		this.worker.onmessage = (event) => {
			const { command, colors, type, history, buffer, channel, text, payload } = event.data;

			switch (type) {
				case "audio":
					this.queueAudioChunk(buffer);
					break;
				case "ready":
					this.resolveWorkerReady();
					break;
				case "reply": {
					const { id, type: _type, ...data } = event.data;
					this.requests.get(id)?.(data);
					this.requests.delete(id);
					break;
				}
				case "trace":
					this.handleTraceReceived(history);
					break;
				case "log":
					logBus.emit(channel, text, payload);
					// this.emitLog({ kind, name, text, data, color });
					break;
				case "isRunning":
					this._isRunning = event.data.isRunning;
					if (this._isRunning) this._playPending = false;
					else this.recordStop(event.data.stop);
					this.onmessage?.(event);
					break;
				case "hypercall":
					// The worker ran `BRK <cmd>` (and stopped if the call asked to): apply its effect.
					applyHypercall(event.data.call);
					break;
				case "break":
					this.onmessage?.(event);
					break;
				case "breakpointHit":
					this.onmessage?.(event);
					break;
				default:
					if (command === "setPalette") {
						this.palette = colors;
						this.videoOutput?.setPalette(colors);
					} else if (command === "setViewRect") {
						this.viewRect = event.data.rect;
						this.videoOutput?.setViewRect(event.data.rect);
						const { width, height } = event.data.rect;
						if (width > 0 && height > 0) this.videoAspect.value = width / height;
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

		// Attach keyboard listener
		window.addEventListener("keydown", this.keyHandler);
		window.addEventListener("keyup", this.keyUpHandler);
		window.addEventListener("paste", this.pasteHandler);
		window.addEventListener("blur", this.blurHandler);
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
		if (this.bus.prepareWorkerPayloads) payloads = await this.bus.prepareWorkerPayloads();

		// 4. Initialize the worker with the prepared buffer, config, and payloads
		const chunks = await Promise.all(
			(this.machineConfig.memory.chunks ?? []).map(async (chunk) => ({ ...chunk, data: await chunkData(chunk) })),
		);

		this.worker.postMessage({
			command: "init",
			machine: {
				name: this.machineConfig.name,
				hypercalls: !!this.machineConfig.hypercalls,
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
					hasTests: this.machineConfig.video?.hasTests,
				},
				memory: { buffer: this.sharedBuffer, size: this.machineConfig.memory.size, chunks },
				disk: { ...this.machineConfig.disk },
			},
		});

		this.setSpeed(this.machineConfig.speed ?? 1);
		await this.workerReadyPromise;
	}

	/**
	 * Why the CPU last stopped. Set when `isRunning` turns false, before `onmessage` sees it,
	 * so a watcher on the running state can read it. A new object on every stop.
	 */
	public get lastStop() {
		return this._lastStop;
	}

	private recordStop(stop: StopInfo | undefined) {
		if (!stop) return;
		this._lastStop = stop;
	}

	public get isRunning() {
		return this._isRunning;
	}

	/** Running, or `play()` was sent and the worker hasn't answered yet: a stop seen now is about to end. */
	public get isRunningOrStarting() {
		return this._isRunning || this._playPending;
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

		if (this.palette) this.videoOutput.setPalette(this.palette);
		if (this.viewRect) this.videoOutput.setViewRect(this.viewRect);
		this.videoOutput.setIntegerScaling(this.integerScaling);

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

		// Underrun (a gap in the audio data): restart a little ahead of now, so the next chunks join up.
		// Too much queued (sound produced faster than played): drop the chunk rather than lag behind.
		if (nextStartTime < currentTime) nextStartTime = currentTime + AUDIO_PREBUFFER;
		else if (nextStartTime - currentTime > AUDIO_MAX_LATENCY) return;

		source.start(nextStartTime);

		// Schedule the next chunk to start right after this one finishes
		nextStartTime += audioBuffer.duration;
	}

	private handleKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target && (kbdElements.has(target.tagName) || target.isContentEditable)) return;

		// Debugger Shortcuts; with Alt, step over / out go through the breakpoints
		if (event.code === "F10") {
			event.preventDefault();
			this.stepOver(event.altKey);
			return;
		}
		if (event.code === "F11") {
			event.preventDefault();
			if (event.shiftKey) this.stepOut(event.altKey);
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
			this.typeText(text).catch((e) => console.error("Paste:", e));
		}
	}

	/**
	 * Types `text` on the machine's keyboard: queued in the worker, and given to the program as it reads the keys
	 * (paused, they wait). Resolves with how many were queued and skipped (no key for them), and the keyboard state.
	 */
	public typeText = (text: string) => this.keyboardRequest("type", { text });
	/** Holds a key down (a character, or a key code) until `holdKey(null)`. */
	public holdKey = (key: string | number | null) => this.keyboardRequest("hold", { key });
	/** Empties the typed keys queue. */
	public clearKeys = () => this.keyboardRequest("clear");
	/** Cycles after the program consumes a typed key before it gets the next one. */
	public setKeyDelay = (cycles: number) => this.keyboardRequest("delay", { cycles });
	public getKeyboardState = () => this.keyboardRequest("state");
	private keyboardRequest = async (action: string, data: object = {}) => {
		const answer = await this.request<{ state?: KeyboardState; queued?: number; skipped?: number; error?: string }>(
			"keyboard",
			{ action, ...data },
		);
		if (answer.error) throw new Error(answer.error);
		return answer as { state: KeyboardState; queued?: number; skipped?: number };
	};

	private handleTraceReceived(history: { type: string; source: number; target: number }[]) {
		const newHead = history.length > 0 ? JSON.stringify(history[0]) : "";
		this.traceOverflow.value = !!this.lastTraceHead && !!newHead && this.lastTraceHead !== newHead;
		this.lastTraceHead = newHead;
		this.onTraceReceived?.(history);
	}

	public syncBusState() {
		if (this.bus?.syncStateFromBuffer) {
			const state = this.bus.syncStateFromBuffer(this.sharedRegisters);
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

	public setSpeed = (speed: number) => this.worker.postMessage({ command: "setSpeed", speed });
	public getSpeed = () => this.sharedRegisters.getFloat64(REG_SPEED_OFFSET, true);
	public setBreakOnBrk = (enabled: boolean) => this.worker.postMessage({ command: "setBreakOnBrk", enabled });
	public play = () => {
		this._playPending = true;
		this.worker.postMessage({ command: "run" });
	};
	public pause = () => {
		this._playPending = false;
		this.worker.postMessage({ command: "pause" });
	};
	/** Resolves once the worker has reset (the machine is then stopped, PC on the reset vector). */
	public reset = (): Promise<void> => this.request("reset").then(() => undefined);
	/** Steps `count` instructions (fewer if something stops it, see `StepResult`); resolves when done. */
	public step = (count = 1): Promise<StepResult> =>
		this.request<StepResult>("step", { count }).then((result) => {
			this.recordStop(result.stop ?? { reason: "step", address: result.address });
			return result;
		});

	private requests = new Map<number, (data: unknown) => void>();
	private nextRequestId = 1;
	/** Sends a worker command that answers with a `reply` message (see `reply` in cpu.worker.ts). */
	private request<T>(command: string, data: object = {}): Promise<T> {
		const id = this.nextRequestId++;
		return new Promise<T>((resolve) => {
			this.requests.set(id, resolve as (data: unknown) => void);
			this.worker.postMessage({ command, id, ...data });
		});
	}
	/**
	 * Step over (a JSR: runs to the instruction after it; else one step) / step out (runs until the routine returns).
	 * `through`: the breakpoints on the way don't stop it (their hooks still run). Resolves with `running`, and
	 * `step` (its result) for a step over that isn't on a JSR: that one is a single step.
	 */
	public stepOver = (through = false) => this.stepRun("stepOver", through);
	/** The step over / out under way stops going through the breakpoints (it stays armed). */
	public endStepThrough = () => this.worker.postMessage({ command: "endStepThrough" });
	public stepOut = (through = false) => this.stepRun("stepOut", through);
	private stepRun(command: "stepOver" | "stepOut", through: boolean) {
		return this.request<{ running: boolean; step?: StepResult }>(command, { through }).then(({ running, step }) => {
			// A step over not on a JSR: a single step, done (as `step` records it)
			if (step?.executed) this.recordStop(step.stop ?? { reason: "step", address: step.address });
			return { running, step };
		});
	}

	public addBP = (type: Breakpoint["type"], address: number, endAddress?: number) =>
		this.worker.postMessage({ command: "addBP", type, address, endAddress });
	public removeBP = (type: Breakpoint["type"], address: number, endAddress?: number) =>
		this.worker.postMessage({ command: "removeBP", type, address, endAddress });
	public clearBPs = () => this.worker.postMessage({ command: "clearBPs" });

	public insertDisk = (data: Uint8Array, metadata: Dict = {}) =>
		this.worker.postMessage({ command: "insertMedia", data, metadata });
	public ejectDisk = (metadata: Dict = {}) => this.worker.postMessage({ command: "ejectMedia", metadata });

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

	/** Instruction trace (last instructions + registers): on (cleared, `size` entries) or off (kept). */
	public setInstructionTrace = (enabled: boolean, size?: number) =>
		this.request<TraceSnapshot>("setInstructionTrace", { enabled, size });
	/** The last `count` instructions recorded (all if omitted), oldest first. */
	public getInstructionTrace = (count?: number) => this.request<TraceSnapshot>("getInstructionTrace", { count });
	public setTraceSize = (size: number) => this.worker.postMessage({ command: "setTraceSize", size });
	public getTrace = () => this.worker.postMessage({ command: "getTrace" });
	public clearTrace = () => {
		this.worker.postMessage({ command: "clearTrace" });
		this.traceOverflow.value = false;
		this.lastTraceHead = "";
	};
	/** Redraws the frame from memory (the screen isn't redrawn while paused); resolves once it is drawn. */
	public refreshVideo = (): Promise<void> => this.request("refreshVideo").then(() => undefined);

	/** Save states (cpu/saveStates.ts), kept in the worker: lost when the VM is rebuilt. */
	private stateRequest = async <T>(command: string, data: object): Promise<T> => {
		const answer = await this.request<{ result?: T; error?: string }>(command, data);
		if (answer.error) throw new Error(answer.error);
		return answer.result as T;
	};
	public saveMachineState = (name: string, meta: SaveStateMeta = {}) =>
		this.stateRequest<SaveStateInfo>("saveState", { name, meta });
	/** Stops the machine (as paused) and puts the state back; undefined when there is no state `name`. */
	public restoreMachineState = (name: string) =>
		this.stateRequest<SaveStateInfo | undefined>("restoreState", { name });
	public listMachineStates = () => this.stateRequest<SaveStateInfo[]>("listStates", {});
	/** Without a name, deletes them all. Returns the names deleted. */
	public deleteMachineStates = (name?: string) => this.stateRequest<string[]>("deleteStates", { name });

	/**
	 * The screen as a PNG, as displayed: the visible part of the video buffer (border included), at its
	 * resolution, built from the buffer and the palette (not the canvas: exact pixels, whatever the canvas
	 * size or scaling). When paused, the frame is redrawn from memory first.
	 * Used by the toolbar's Save Screenshot and the MCP `screenshot` tool. Undefined if the machine has no video.
	 */
	public async screenshot(): Promise<Screenshot | undefined> {
		const video = this.machineConfig.video;
		if (!video || !this.videoMemory) return undefined;
		if (!this._isRunning) await this.refreshVideo();
		const { width, height, ...rect } = this.viewRect ?? { x: 0, y: 0, width: video.width, height: video.height };
		const pixels = cropVideoBuffer(this.videoMemory, video.width, { ...rect, width, height });
		const png = await encodeIndexedPng(width, height, pixels, this.palette ?? grayscalePalette());
		return { width, height, png };
	}
	public mute = (enabled: boolean) => this.worker.postMessage({ command: "mute", enabled });

	public getBank(address: number) {
		return this.bus?.getBank?.(address) ?? 0;
	}

	public getScope(address: number): string {
		return this.bus?.getScope?.(address) ?? "main";
	}

	public getScopes(): string[] {
		return this.bus?.getScopes?.() ?? ["main"];
	}

	public search(
		pattern: (number | null)[],
		startAddress: number,
		endAddress: number,
		is7Bit: boolean,
		candidates?: number[][],
	) {
		return this.bus?.search(pattern, startAddress, endAddress, is7Bit, candidates);
	}

	public read(address: number): number {
		return this.bus ? this.bus.read(address) : (this.sharedMemory[address] ?? 0);
	}

	public readDebug(address: number, overrides?: Dict | string): number {
		return this.bus?.readDebug ? this.bus.readDebug(address, overrides) : this.read(address);
	}

	/** What the CPU would read at `address` (current banking), without I/O side effects. */
	public peek(address: number): number {
		return this.bus?.peek ? this.bus.peek(address) : this.readDebug(address);
	}

	public readDebugRange(address: number, length: number, overrides?: Dict | string): Uint8Array {
		if (this.bus?.readDebugRange) return this.bus.readDebugRange(address, length, overrides);

		// Fallback if bus doesn't implement it
		const data = new Uint8Array(length);
		for (let i = 0; i < length; i++) {
			data[i] = this.readDebug(address + i, overrides);
		}
		return data;
	}

	public writeDebug(address: number, value: number, overrides?: Dict) {
		if (this.bus?.writeDebug) this.bus.writeDebug(address, value, overrides);
		else this.updateMemory(address, value);
	}

	// write from the thread for I/O (only mem is shared)
	public writeIO(address: number, value: number) {
		this.bus?.ioWrite(address, value, this.worker);
	}

	public updateMemory(addr: number, value: number) {
		if (this.bus) this.bus.write(addr, value);
		else this.sharedMemory[addr] = value;
	}

	/** The CPU registers as they are now in the shared buffer (the worker writes them as it runs). */
	public getRegisters = () => readRegisters(this.sharedRegisters);

	public saveRegisters() {
		const state = [
			this.sharedRegisters.getUint8(REG_A_OFFSET),
			this.sharedRegisters.getUint8(REG_X_OFFSET),
			this.sharedRegisters.getUint8(REG_Y_OFFSET),
			this.sharedRegisters.getUint8(REG_SP_OFFSET),
			this.sharedRegisters.getUint8(REG_STATUS_OFFSET),
			this.sharedRegisters.getUint16(REG_PC_OFFSET, true),
		];
		this.stateStack.push(state);
	}

	public restoreRegisters() {
		const state = this.stateStack.pop();
		if (state) {
			this.sharedRegisters.setUint8(REG_A_OFFSET, state[0]);
			this.sharedRegisters.setUint8(REG_X_OFFSET, state[1]);
			this.sharedRegisters.setUint8(REG_Y_OFFSET, state[2]);
			this.sharedRegisters.setUint8(REG_SP_OFFSET, state[3]);
			this.sharedRegisters.setUint8(REG_STATUS_OFFSET, state[4]);
			this.sharedRegisters.setUint16(REG_PC_OFFSET, state[5], true);
		}
	}

	public updateRegister(reg: keyof EmulatorRegisters, value: number) {
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

	public setDebugOverrides(category: string, overrides: Dict) {
		// Integer scaling is a display concern handled on the main thread, not by the machine's renderer
		if (category === "video") {
			this.integerScaling = !!overrides.integerScaling;
			this.videoOutput?.setIntegerScaling(this.integerScaling);
		}
		this.worker.postMessage({
			command: "setDebugOverrides",
			category,
			overrides: { ...overrides },
		});
	}

	public setAnalogInput(index: number, value: number) {
		if (index >= 0 && index < MAX_ANALOG_INPUTS)
			this.sharedRegisters.setFloat32(INPUT_ANALOG_0_OFFSET + index * 4, value, true);
	}

	public setDigitalInput(value: number) {
		this.sharedRegisters.setUint16(INPUT_DIGITAL_OFFSET, value, true);
	}

	public setInputButton(index: number, pressed: boolean) {
		const current = this.sharedRegisters.getUint16(INPUT_DIGITAL_OFFSET, true);
		const mask = 1 << index;
		const newValue = pressed ? current | mask : current & ~mask;
		this.sharedRegisters.setUint16(INPUT_DIGITAL_OFFSET, newValue, true);
	}

	public getDebugOptions() {
		return this.machineConfig.debug?.options ?? [];
	}

	public getMachineStateSpecs() {
		return this.bus?.getMachineStateSpecs ? this.bus.getMachineStateSpecs() : [];
	}

	public terminate() {
		this.isRendering = false;
		this.videoOutput?.destroy();
		this.worker.terminate();
		window.removeEventListener("keydown", this.keyHandler);
		window.removeEventListener("keyup", this.keyUpHandler);
		window.removeEventListener("paste", this.pasteHandler);
		window.removeEventListener("blur", this.blurHandler);
		// this.logListeners.length = 0;
		this.stopTracePolling();

		console.log("VM: Worker terminated.");
	}
}
