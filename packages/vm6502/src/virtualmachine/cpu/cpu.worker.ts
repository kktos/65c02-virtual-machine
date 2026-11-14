import type { MachineConfig } from "@/types/machine.interface";
import type { Video } from "@/types/video.interface";
import { BP_PC, bankedBreakpoints, breakpointMap } from "./breakpoints";
import type { IBus } from "../../types/bus.interface";
import {
	addBreakpoint,
	clearBreakpoints,
	clearTrace,
	getTrace,
	initCPU,
	isStoppedOnBrk,
	isStoppedOnAccess,
	prepareForRestore,
	removeBreakpoint,
	resetCPU,
	setBreakOnBrk,
	setClockSpeed,
	setHypercalls,
	setIrqLine,
	setRunning,
	triggerNmi,
	setTrace,
	setTraceSize,
	stepInstruction,
	stepInstructions,
	stepOutInstruction,
	endStepThrough,
	skipBreakpointOnce,
	stepOverInstruction,
} from "./cpu.65c02";
import { loadBus } from "./loaders/bus.loader";
import { readInstructionTrace, setInstructionTrace } from "./instructionTrace";
import { loadVideo } from "./loaders/video.loader";
import {
	deleteMachineStates,
	hasMachineState,
	listMachineStates,
	type MachineViews,
	restoreMachineState,
	saveMachineState,
} from "./saveStates";
import { MEMORY_OFFSET, REG_PC_OFFSET, STACK_METADATA_OFFSET } from "./shared-memory";

const COLORED_LOG = "color:magenta;font-weight:bold;";
const COLORDEFAULT_LOG = "color:inherit;font-weight:normal;";
console.log("%cWorker:%c Loaded.", COLORED_LOG, COLORDEFAULT_LOG);

// --- Worker State ---
let sharedBuffer: SharedArrayBuffer | null = null;
let memoryView: Uint8Array | null = null;
let stackMetadataView: Uint8Array | null = null;
let registersView: DataView | null = null;
let video: Video | null = null;
let bus: IBus | null = null;
// The last speed asked for: it can come before the bus is loaded
let clockSpeedMhz = 1;

async function init(machine: MachineConfig) {
	if (!(machine.memory.buffer instanceof SharedArrayBuffer)) {
		console.error("Worker: Did not receive a SharedArrayBuffer.");
		return;
	}

	sharedBuffer = machine.memory.buffer;
	registersView = new DataView(sharedBuffer, 0, MEMORY_OFFSET);
	memoryView = new Uint8Array(sharedBuffer, MEMORY_OFFSET, machine.memory.size);
	stackMetadataView = new Uint8Array(sharedBuffer, STACK_METADATA_OFFSET, 256);

	bus = await loadBus(machine.bus, memoryView);
	if (!bus) return;

	// Give bus access to the registers view for state syncing
	if (bus.setRegistersView) bus.setRegistersView(registersView);
	bus.setClockSpeed?.(clockSpeedMhz);

	if (machine.memory.chunks) {
		for (const chunk of machine.memory.chunks) {
			const data = chunk.data as Uint8Array;
			bus.load(chunk.addr, data, chunk.bank, chunk.tag);
		}
	}

	if (machine.video) {
		video = await loadVideo(machine.video, registersView, memoryView);
		if (!video) return;
		if (machine.video.hasTests) video.setupTests?.(bus);
	}

	initCPU(bus, registersView, video, memoryView, stackMetadataView);
	setIrqLine(false);
	bus.setInterruptLines?.({ irq: setIrqLine, nmi: triggerNmi });
	setHypercalls(!!machine.hypercalls);

	bus.syncState?.();
	console.log(`%cWorker:%c Initialized with "${machine.name}".`, COLORED_LOG, COLORDEFAULT_LOG);
	self.postMessage({ type: "ready" });
}

/** Save state commands: `{ result }` or `{ error }`. Restoring stops the machine (as paused) first. */
const saveStateCommand = (command: string, data: { name?: string; meta?: Record<string, unknown> }) => {
	const views: MachineViews = {
		registers: registersView as DataView,
		stackMetadata: stackMetadataView as Uint8Array,
		memory: memoryView as Uint8Array,
		bus,
	};
	try {
		switch (command) {
			case "saveState":
				return { result: saveMachineState(data.name as string, views, data.meta) };
			case "restoreState": {
				if (!hasMachineState(data.name as string)) return { result: undefined };
				prepareForRestore();
				const result = restoreMachineState(data.name as string, views);
				if (result) video?.tick(); // the frame of the restored screen
				return { result };
			}
			case "listStates":
				return { result: listMachineStates() };
			default:
				return { result: deleteMachineStates(data.name) };
		}
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
};

/** The typed keys queue, the key held, the delay between typed keys: `{ state, queued?, skipped? }` or `{ error }`. */
const keyboardCommand = (data: { action: string; text?: string; key?: string | number | null; cycles?: number }) => {
	if (!bus?.getKeyboardState) return { error: "This machine has no keyboard queue" };
	try {
		let typed: { queued: number; skipped: number } | undefined;
		switch (data.action) {
			case "type":
				typed = bus.typeText?.(data.text ?? "");
				break;
			case "hold":
				bus.holdKey?.(data.key ?? null);
				break;
			case "clear":
				bus.clearKeys?.();
				break;
			case "delay":
				bus.setKeyDelay?.(data.cycles ?? 0);
				break;
		}
		return { state: bus.getKeyboardState(), ...typed };
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
};

/** Answers a request from the main thread (`VirtualMachine.request`): only when it carries an `id`. */
const reply = (event: MessageEvent, data: object = {}) => {
	if (event.data.id !== undefined) self.postMessage({ type: "reply", id: event.data.id, ...data });
};

self.onmessage = async (event: MessageEvent) => {
	const { command, speed, machine, key, code } = event.data;

	if (command === "init") return init(machine);

	if (!sharedBuffer || !registersView || !memoryView) {
		console.error(`Worker: Not initialized. Send 'init' command with buffer first. ${JSON.stringify(event.data)}`);
		return;
	}

	switch (command) {
		case "run":
			// Paused at a PC breakpoint: the run doesn't stop on it again at once (run, not stepped, so a step out
			// ending on that instruction still stops).
			{
				const pc = registersView.getUint16(REG_PC_OFFSET, true);
				// Stopped on a BRK ("break on BRK"): resuming executes it (through $FFFE). Not also the
				// breakpoint check below, which would step over a breakpoint set on the BRK handler.
				// Same after a read / write breakpoint: the instruction is run again, without stopping on the access.
				if (isStoppedOnBrk() || isStoppedOnAccess()) stepInstruction();
				// biome-ignore lint/style/noNonNullAssertion: <expected>
				else if (breakpointMap[pc]! & BP_PC) {
					// Fast check passed, now do detailed check
					const bank = bus?.getBank?.(pc) ?? 0;
					const physicalPC = (bank << 16) | pc;
					// biome-ignore lint/style/noNonNullAssertion: <expected>
					if (bankedBreakpoints.get(physicalPC)! & BP_PC) skipBreakpointOnce(pc);
				}
			}
			setRunning(true);
			break;
		case "pause":
			setRunning(false, { reason: "pause" });
			break;
		case "step": {
			const result = stepInstructions(event.data.count ?? 1);
			reply(event, result);
			break;
		}
		case "stepOver":
			{
				const step = stepOverInstruction(event.data.through === true);
				reply(event, step ? { running: false, step } : { running: true });
			}
			break;
		case "endStepThrough":
			endStepThrough();
			break;
		case "stepOut":
			reply(event, { running: stepOutInstruction(event.data.through === true) });
			break;
		case "setSpeed":
			if (typeof speed === "number" && speed >= 0) {
				setClockSpeed(speed);
				clockSpeedMhz = speed;
				bus?.setClockSpeed?.(speed);
				console.log(`%cWorker:%c Clock speed set to ${speed} MHz.`, COLORED_LOG, COLORDEFAULT_LOG);
			}
			break;
		case "setBreakOnBrk":
			setBreakOnBrk(event.data.enabled);
			break;
		case "reset":
			video?.reset();
			bus?.reset(event.data.cold === true);
			resetCPU();
			reply(event);
			break;
		case "addBP":
			addBreakpoint(event.data.type, event.data.address, event.data.endAddress);
			break;
		case "removeBP":
			removeBreakpoint(event.data.type, event.data.address, event.data.endAddress);
			break;
		case "clearBPs":
			clearBreakpoints();
			break;
		case "insertMedia":
			bus?.insertMedia?.(event.data.data, event.data.metadata);
			break;
		case "ejectMedia":
			bus?.ejectMedia?.(event.data.metadata);
			break;
		case "keydown":
			bus?.pressKey?.(key, code, event.data.ctrl, event.data.shift, event.data.alt, event.data.meta);
			break;
		case "keyup":
			bus?.releaseKey?.(key, code);
			break;
		case "keyboard":
			reply(event, keyboardCommand(event.data));
			break;
		case "setTrace":
			setTrace(event.data.enabled);
			break;
		case "setTraceSize":
			setTraceSize(event.data.size);
			break;
		case "getTrace":
			self.postMessage({ type: "trace", history: getTrace() });
			break;
		case "clearTrace":
			clearTrace();
			break;
		case "setInstructionTrace":
			setInstructionTrace(!!event.data.enabled, event.data.size);
			reply(event, readInstructionTrace(0));
			break;
		case "getInstructionTrace": {
			const snapshot = readInstructionTrace(event.data.count);
			if (event.data.id !== undefined)
				self.postMessage({ type: "reply", id: event.data.id, ...snapshot }, [snapshot.words.buffer]);
			break;
		}
		case "saveState":
		case "restoreState":
		case "listStates":
		case "deleteStates":
			reply(event, saveStateCommand(command, event.data));
			break;
		case "refreshVideo":
			if (video) video.tick();
			reply(event);
			break;
		case "setDebugOverrides":
			switch (event.data.category) {
				case "bus":
					bus?.setDebugOverrides?.(event.data.overrides);
					break;
				case "video":
					video?.setDebugOverrides?.(event.data.overrides);
					break;
			}
			break;
		case "mute":
			bus?.enableAudio?.(event.data.enabled);
			break;
		case "initAudio":
			bus?.initAudio?.(event.data.sampleRate);
			break;
		case "ioWrite":
			bus?.write(event.data.address, event.data.value);
			break;
	}
};
