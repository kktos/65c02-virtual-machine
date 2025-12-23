import type { MachineConfig } from "@/machines/machine.interface";
import type { Video } from "@/video/video.interface";
import type { IBus } from "./bus.interface";
import {
	addBreakpoint,
	clearBreakpoints,
	clearTrace,
	getTrace,
	initCPU,
	removeBreakpoint,
	resetCPU,
	setBreakOnBrk,
	setClockSpeed,
	setRunning,
	setTrace,
	stepInstruction,
	stepOutInstruction,
	stepOverInstruction,
} from "./cpu.65c02";
import { loadBus } from "./loaders/bus.loader";
import { loadVideo } from "./loaders/video.loader";
import { MEMORY_OFFSET } from "./shared-memory";

const COLORED_LOG = "color:magenta;font-weight:bold;";
const COLORDEFAULT_LOG = "color:inherit;font-weight:normal;";
console.log("%cWorker:%c Loaded.", COLORED_LOG, COLORDEFAULT_LOG);

// --- Worker State ---
let sharedBuffer: SharedArrayBuffer | null = null;
let memoryView: Uint8Array | null = null;
let registersView: DataView | null = null;
let video: Video | null = null;
let bus: IBus | null = null;

async function init(machine: MachineConfig) {
	if (!(machine.memory.buffer instanceof SharedArrayBuffer)) {
		console.error("Worker: Did not receive a SharedArrayBuffer.");
		return;
	}

	sharedBuffer = machine.memory.buffer;
	registersView = new DataView(sharedBuffer, 0, MEMORY_OFFSET);
	memoryView = new Uint8Array(sharedBuffer, MEMORY_OFFSET, machine.memory.size);

	bus = await loadBus(machine.bus, memoryView);
	if (!bus) return;

	// Give bus access to the registers view for state syncing
	if (bus.setRegistersView) bus.setRegistersView(registersView);

	if (machine.memory.chunks) {
		for (const chunk of machine.memory.chunks) {
			const data = chunk.data as Uint8Array;
			bus.load(chunk.addr, data, chunk.bank, chunk.tag);
		}
	}

	if (machine.video) {
		video = await loadVideo(machine.video, bus);
		if (!video) return;
	}

	initCPU(bus, registersView, video, memoryView);

	console.log(`%cWorker:%c Initialized with "${machine.name}".`, COLORED_LOG, COLORDEFAULT_LOG);
	self.postMessage({ type: "ready" });
}

self.onmessage = async (event: MessageEvent) => {
	const { command, speed, machine, key, code } = event.data;

	if (command === "init") return init(machine);

	if (!sharedBuffer || !registersView || !memoryView) {
		console.error(`Worker: Not initialized. Send 'init' command with buffer first. ${JSON.stringify(event.data)}`);
		return;
	}

	switch (command) {
		case "run":
			setRunning(true);
			break;
		case "pause":
			setRunning(false);
			break;
		case "step":
			stepInstruction();
			break;
		case "stepOver":
			stepOverInstruction();
			break;
		case "stepOut":
			stepOutInstruction();
			break;
		case "setSpeed":
			if (typeof speed === "number" && speed >= 0) {
				setClockSpeed(speed);
				console.log(`%cWorker:%c Clock speed set to ${speed} MHz.`, COLORED_LOG, COLORDEFAULT_LOG);
			}
			break;
		case "setBreakOnBrk":
			setBreakOnBrk(event.data.enabled);
			break;
		case "reset":
			if (video) video.reset();
			if (bus?.reset) bus.reset();
			resetCPU();
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
		case "keydown":
			if (bus?.pressKey) bus.pressKey(key, code);
			break;
		case "keyup":
			if (bus?.releaseKey) bus.releaseKey(key, code);
			break;
		case "setTrace":
			setTrace(event.data.enabled);
			break;
		case "getTrace":
			self.postMessage({ type: "trace", history: getTrace() });
			break;
		case "clearTrace":
			clearTrace();
			break;
		case "refreshVideo":
			if (video) video.tick();
			break;
	}
};
