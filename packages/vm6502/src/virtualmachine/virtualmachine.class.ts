import { INSTRUCTION_TRACE_DEFAULT_SIZE, type TraceSnapshot } from "./cpu/instructionTrace";
import type { SaveStateInfo, SaveStateMeta } from "./cpu/saveStates";
import type { Dict } from "@/types/dict.type";
import type { BusOptions, MachineConfig, MemoryChunk } from "@/types/machine.interface";
import type { IBus, KeyboardState } from "@/types/bus.interface";
import type { ScreenLocation } from "@/types/video.interface";
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
	type VideoScaling,
	type VideoViewRect,
} from "@/virtualmachine/video/video.output";
import { parseHexData } from "../lib/array.utils";
import type { Breakpoint } from "../types/breakpoint.interface";
import type { Hypercall } from "@/lib/hypercalls.lib";
import type { StepResult, StopInfo } from "@/types/stopinfo.interface";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import { installDevices } from "./cpu/loaders/device.loader";
import { logBus } from "./logbus.class";
import {
	type KeyboardJoystickConfig,
	loadKeyboardJoystickConfig,
	saveKeyboardJoystickConfig,
} from "./keyboardJoystick";
import { encodeIndexedPng } from "@/lib/png.lib";
import type { InterruptsState } from "@/types/interrupts.interface";
import { WorkerClient } from "./workerClient.class";
import { AudioSink } from "./audioSink.class";
import { InputController } from "./inputController.class";

const MACHINES_BASE_PATH = "../machines";
const busModules = import.meta.glob("../machines/*/*.bus.ts");
const cssModules = import.meta.glob("../machines/**/*.css");

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

/**
 * The machine, main-thread side: a façade over the CPU worker (`WorkerClient`), the sound (`AudioSink`) and the
 * host keyboard (`InputController`), plus the shared memory, the video, the trace and the bus on this thread.
 */
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
	private videoScaling: VideoScaling = "fit";
	public busState: Dict = {};
	private isRendering = false;
	private _isRunning = false;
	// `play()` was sent and the worker hasn't said it runs yet: the machine is about to run
	private _playPending = false;
	private _lastStop?: StopInfo;

	private readonly client: WorkerClient;
	private readonly audio = new AudioSink();
	private readonly input = new InputController(this, (message) => this.client.post(message));
	public machineConfig: MachineConfig;
	public bus?: IBus;
	public ready: Promise<void>;

	public onmessage?: (event: MessageEvent) => void;
	public onStateChange?: (state: Dict) => void;
	public onTraceReceived?: (history: { type: string; source: number; target: number }[]) => void;
	/** `traceOverflow` changed */
	public onTraceOverflow?: (overflow: boolean) => void;
	/** `videoAspect` changed */
	public onVideoAspect?: (aspect: number) => void;
	/** The worker ran `BRK <cmd>` (and stopped if the call asked to): the app applies its effect (`applyHypercall`). */
	public onHypercall?: (call: Hypercall) => void;

	public isTraceEnabled = false;
	private _traceOverflow = false;
	/** Width / height of the displayed frame (the view rect): the app layout sizes the video area from it */
	private _videoAspect = 4 / 3;
	private lastTraceHead = "";
	private tracePollInterval: number | undefined;

	private stateStack: number[][] = [];

	/** `busOptions`: the machine as the user set it up (its slots…), for its bus on both threads. */
	constructor(
		machineConfig: MachineConfig,
		public readonly busOptions: BusOptions = {},
	) {
		this.machineConfig = machineConfig;
		this.input.joystick.configure(this.joystickControls(), loadKeyboardJoystickConfig(machineConfig.name));
		if (machineConfig.video) this._videoAspect = machineConfig.video.width / machineConfig.video.height;

		this.client = new WorkerClient((event) => this.handleWorkerMessage(event));

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

		// The CSS (the @font-face of the fonts) must be in before the bus: it draws the text atlases,
		// and document.fonts.load() would resolve at once, with no face to load, on a fallback font.
		this.ready = this.loadCSS()
			.catch((e) => console.warn("VM: Failed to load CSS:", e))
			.then(() => this.loadBus())
			.catch((e) => {
				this.client.fail(e instanceof Error ? e : new Error(String(e)));
				throw e;
			});

		this.input.attach();
	}

	/** The worker's messages other than the start-up and the replies (`WorkerClient` takes those). */
	private handleWorkerMessage(event: MessageEvent) {
		const { command, colors, type, history, buffer, channel, text, payload } = event.data;

		switch (type) {
			case "audio":
				this.audio.queue(buffer);
				break;
			case "trace":
				this.handleTraceReceived(history);
				break;
			case "log":
				logBus.emit(channel, text, payload);
				break;
			case "isRunning":
				this._isRunning = event.data.isRunning;
				if (this._isRunning) this._playPending = false;
				else this.recordStop(event.data.stop);
				this.onmessage?.(event);
				break;
			case "hypercall":
				this.onHypercall?.(event.data.call);
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
					if (width > 0 && height > 0) this.setVideoAspect(width / height);
				} else {
					this.onmessage?.(event);
				}
				break;
		}
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
			} else {
				console.warn(`VM: CSS module not found: ${key}`);
			}
		}
	}

	private async loadBus() {
		const busConfig = this.machineConfig.bus;
		const busModuleKey = `${MACHINES_BASE_PATH}/${busConfig.path}.ts`;
		const busModuleLoader = busModules[busModuleKey];
		if (!busModuleLoader) throw new Error(`Could not find the bus module ${busModuleKey}`);
		const BusModule = await busModuleLoader();
		const exportedBusEntry = Object.entries(BusModule as object).find(([name]) => name === busConfig.class);
		if (!exportedBusEntry) throw new Error(`Could not find the class ${busConfig.class} in ${busModuleKey}`);
		const [, BusClass]: [unknown, new (mem: Uint8Array, options?: BusOptions) => IBus] = exportedBusEntry;
		this.bus = new BusClass(this.sharedMemory, this.busOptions);
		await installDevices(this.bus, this.machineConfig.devices);
		console.log(`VM: Bus ${busConfig.class} loaded on main thread.`);

		// 3. Prepare worker payloads (if any)
		let payloads: { video?: unknown; bus?: unknown } = {};
		if (this.bus.prepareWorkerPayloads) payloads = await this.bus.prepareWorkerPayloads();

		// 4. Initialize the worker with the prepared buffer, config, and payloads
		const chunks = await Promise.all(
			(this.machineConfig.memory.chunks ?? []).map(async (chunk) => ({ ...chunk, data: await chunkData(chunk) })),
		);

		this.client.post({
			command: "init",
			machine: {
				name: this.machineConfig.name,
				hypercalls: !!this.machineConfig.hypercalls,
				bus: {
					path: this.machineConfig.bus.path,
					class: this.machineConfig.bus.class,
					payload: payloads.bus,
					options: this.busOptions,
				},
				// Plain values (the config is reactive): the worker loads their classes itself
				devices: JSON.parse(JSON.stringify(this.machineConfig.devices ?? [])),
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
				// Only plain values: the config is reactive (a proxy, which postMessage can't clone)
			},
		});

		this.setSpeed(this.machineConfig.speed ?? 1);
		await this.client.started;
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
		return this._isRunning || (this._playPending && !this.client.failure);
	}

	/** The jumps trace lost entries between two polls (its buffer wrapped). */
	public get traceOverflow() {
		return this._traceOverflow;
	}

	private setTraceOverflow(overflow: boolean) {
		if (overflow === this._traceOverflow) return;
		this._traceOverflow = overflow;
		this.onTraceOverflow?.(overflow);
	}

	/** Width / height of the displayed frame (the view rect): the app layout sizes the video area from it. */
	public get videoAspect() {
		return this._videoAspect;
	}

	private setVideoAspect(aspect: number) {
		if (aspect === this._videoAspect) return;
		this._videoAspect = aspect;
		this.onVideoAspect?.(aspect);
	}

	/** Host keys as the joystick (off unless the user turned it on) */
	public get keyboardJoystick() {
		return this.input.joystick;
	}

	public initVideo(canvas: HTMLCanvasElement) {
		if (!this.machineConfig.video || !this.videoMemory) {
			console.warn("This machine does not have video output.");
			return;
		}
		this.videoOutput?.destroy();
		this.videoOutput = new VideoOutput(
			canvas,
			this.videoMemory,
			this.machineConfig.video.width,
			this.machineConfig.video.height,
		);

		if (this.palette) this.videoOutput.setPalette(this.palette);
		if (this.viewRect) this.videoOutput.setViewRect(this.viewRect);
		this.videoOutput.setScaling(this.videoScaling);

		// Called again (another canvas): the frame loop already runs, on the new output
		if (this.isRendering) return;
		this.isRendering = true;
		this.renderFrame();
	}

	/** Starts the sound (after a user gesture): the worker sends its chunks from then on. */
	public async initAudio() {
		const sampleRate = await this.audio.open();
		this.client.post({ command: "initAudio", sampleRate });
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
		this.setTraceOverflow(!!this.lastTraceHead && !!newHead && this.lastTraceHead !== newHead);
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

	public setSpeed = (speed: number) => this.client.post({ command: "setSpeed", speed });
	public getSpeed = () => this.sharedRegisters.getFloat64(REG_SPEED_OFFSET, true);
	public setBreakOnBrk = (enabled: boolean) => this.client.post({ command: "setBreakOnBrk", enabled });
	public play = () => {
		if (this.client.failure) return;
		this._playPending = true;
		this.client.post({ command: "run" });
	};
	public pause = () => {
		this._playPending = false;
		this.client.post({ command: "pause" });
	};
	/** Pauses; resolves once the worker has stopped (its registers are then in the shared buffer, see `updateRegister`). */
	public pauseAndWait = (): Promise<void> => {
		this._playPending = false;
		return this.request("pause").then(() => undefined);
	};
	/**
	 * Resolves once the worker has reset (the machine is then stopped, PC on the reset vector). `cold`: a power-up
	 * (the ROM cold-starts: on the Apple, it boots the disk).
	 */
	public reset = (opts: { cold?: boolean } = {}): Promise<void> =>
		this.request("reset", { cold: opts.cold === true }).then(() => undefined);
	/** Steps `count` instructions (fewer if something stops it, see `StepResult`); resolves when done. */
	public step = (count = 1): Promise<StepResult> =>
		this.request<StepResult>("step", { count }).then((result) => {
			this.recordStop(result.stop ?? { reason: "step", address: result.address });
			return result;
		});

	private request<T>(command: string, data: object = {}): Promise<T> {
		return this.client.request<T>(command, data);
	}
	/**
	 * Step over (a JSR: runs to the instruction after it; else one step) / step out (runs until the routine returns).
	 * `through`: the breakpoints on the way don't stop it (their hooks still run). Resolves with `running`, and
	 * `step` (its result) for a step over that isn't on a JSR: that one is a single step.
	 */
	public stepOver = (through = false) => this.stepRun("stepOver", through);
	/** The step over / out under way stops going through the breakpoints (it stays armed). */
	public endStepThrough = () => this.client.post({ command: "endStepThrough" });
	public stepOut = (through = false) => this.stepRun("stepOut", through);
	private stepRun(command: "stepOver" | "stepOut", through: boolean) {
		return this.request<{ running: boolean; step?: StepResult }>(command, { through }).then(({ running, step }) => {
			// A step over not on a JSR: a single step, done (as `step` records it)
			if (step?.executed) this.recordStop(step.stop ?? { reason: "step", address: step.address });
			return { running, step };
		});
	}

	public addBP = (type: Breakpoint["type"], address: number, endAddress?: number) =>
		this.client.post({ command: "addBP", type, address, endAddress });
	public removeBP = (type: Breakpoint["type"], address: number, endAddress?: number) =>
		this.client.post({ command: "removeBP", type, address, endAddress });
	public clearBPs = () => this.client.post({ command: "clearBPs" });

	public insertDisk = (data: Uint8Array, metadata: Dict = {}) =>
		this.client.post({ command: "insertMedia", data, metadata });
	public ejectDisk = (metadata: Dict = {}) => this.client.post({ command: "ejectMedia", metadata });

	/** Instructions the trace switch keeps (the instruction trace's size, rounded up to a power of 2). */
	public instructionTraceSize = INSTRUCTION_TRACE_DEFAULT_SIZE;

	/** The trace switch: the JSR / JMP / interrupt log and the instruction trace (restarted, cleared). */
	public setTrace = (enabled: boolean) => {
		this.isTraceEnabled = enabled;
		this.client.post({ command: "setTrace", enabled });
		this.client.post({ command: "setInstructionTrace", enabled, size: this.instructionTraceSize });
		if (enabled) {
			this.startTracePolling();
		} else {
			this.stopTracePolling();
			this.setTraceOverflow(false);
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
	/** The machine's interrupt controller (IMU), null when it has none. */
	public getInterrupts = () =>
		this.request<{ state: InterruptsState | null }>("getInterrupts").then((answer) => answer.state);
	public getInstructionTrace = (count?: number) => this.request<TraceSnapshot>("getInstructionTrace", { count });
	public setTraceSize = (size: number) => this.client.post({ command: "setTraceSize", size });
	public getTrace = () => this.client.post({ command: "getTrace" });
	/** Clears both traces (the jumps log and the instruction trace). */
	public clearTrace = () => {
		this.client.post({ command: "clearTrace" });
		this.client.post({ command: "clearInstructionTrace" });
		this.setTraceOverflow(false);
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
	 * The memory behind a point of the screen (a mouse event's clientX / clientY), as the machine's video
	 * drew it. Undefined outside the picture, or when the machine doesn't map its screen.
	 */
	public async locateOnScreen(clientX: number, clientY: number): Promise<ScreenLocation | undefined> {
		const point = this.videoOutput?.clientToBuffer(clientX, clientY);
		if (!point) return undefined;
		const { location } = await this.request<{ location?: ScreenLocation }>("screenToAddress", point);
		return location;
	}

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
	public mute = (enabled: boolean) => this.client.post({ command: "mute", enabled });

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
		this.bus?.ioWrite(address, value, this.client.worker);
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

	/**
	 * Pops what saveRegisters pushed. `keepFlags`: the P bits that stay as they are now (the others are restored).
	 * Paused only, as `updateRegister`.
	 */
	public restoreRegisters(keepFlags = 0) {
		this.assertPaused("restoreRegisters");
		const state = this.stateStack.pop();
		if (state) {
			const status = this.sharedRegisters.getUint8(REG_STATUS_OFFSET);
			this.sharedRegisters.setUint8(REG_A_OFFSET, state[0]);
			this.sharedRegisters.setUint8(REG_X_OFFSET, state[1]);
			this.sharedRegisters.setUint8(REG_Y_OFFSET, state[2]);
			this.sharedRegisters.setUint8(REG_SP_OFFSET, state[3]);
			this.sharedRegisters.setUint8(REG_STATUS_OFFSET, (state[4] & ~keepFlags) | (status & keepFlags));
			this.sharedRegisters.setUint16(REG_PC_OFFSET, state[5], true);
		}
	}

	/**
	 * Paused only (throws otherwise, `pauseAndWait` first): while the CPU runs, it holds its registers in locals and
	 * writes them back over the shared buffer at the end of each slice, so a write here would be lost.
	 */
	public updateRegister(reg: keyof EmulatorRegisters, value: number) {
		this.assertPaused("updateRegister");
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

	/** Running, or about to (`play()` sent): the registers can't be written. */
	private assertPaused(what: string) {
		if (this.isRunningOrStarting) throw new Error(`${what}: the machine is running, pause it first`);
	}

	public setDebugOverrides(category: string, overrides: Dict) {
		// Scaling is a display concern handled on the main thread, not by the machine's renderer.
		// Scale (on unless turned off) fits the window, by whole multiples with integer scaling;
		// off, the picture keeps its original size.
		if (category === "video") {
			this.videoScaling =
				overrides.wannaScale === false ? "native" : overrides.integerScaling ? "integer" : "fit";
			this.videoOutput?.setScaling(this.videoScaling);
		}
		this.client.post({
			command: "setDebugOverrides",
			category,
			overrides: { ...overrides },
		});
	}

	/** The machine's joystick controls (none if it has no joystick) */
	public joystickControls() {
		return this.machineConfig.inputs?.filter((d) => d.type === "joystick").flatMap((d) => d.controls) ?? [];
	}

	/** Turns the keyboard joystick on / off, binds its keys, and remembers it for this machine. */
	public setKeyboardJoystick(config: KeyboardJoystickConfig) {
		saveKeyboardJoystickConfig(this.machineConfig.name, config);
		this.input.joystick.configure(this.joystickControls(), config);
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
		this.input.detach();
		this.audio.close();
		this.client.terminate();
		this.stopTracePolling();

		console.log("VM: Worker terminated.");
	}
}
