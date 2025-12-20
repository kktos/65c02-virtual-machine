import type { MachineConfig } from "@/types/machine.interface";
import type { Video } from "@/video/video.interface";
import type { IBus } from "./bus.interface";
import {
	addBreakpoint,
	clearBreakpoints,
	initCPU,
	removeBreakpoint,
	resetCPU,
	setClockSpeed,
	setRunning,
	stepInstruction,
	stepOutInstruction,
	stepOverInstruction,
} from "./cpu.65c02";
import { MEMORY_OFFSET } from "./shared-memory";

console.log("CPU Worker script loaded.");

// --- Worker State ---
let sharedBuffer: SharedArrayBuffer | null = null;
let memoryView: Uint8Array | null = null;
let registersView: DataView | null = null;
let videoView: Uint8Array | null = null;
let video: Video | null = null;

// Vite-specific way to handle dynamic imports in workers.
const busModules = import.meta.glob("../machines/*/bus.class.ts");
const videoModules = import.meta.glob("../machines/*/video.ts");

async function init(buffer: SharedArrayBuffer, machine: MachineConfig) {
	if (!(buffer instanceof SharedArrayBuffer)) {
		console.error("Worker: Did not receive a SharedArrayBuffer.");
		return;
	}

	sharedBuffer = buffer;
	registersView = new DataView(sharedBuffer, 0, MEMORY_OFFSET);
	memoryView = new Uint8Array(sharedBuffer, MEMORY_OFFSET, machine.memory.size);

	// Construct the key for the busModules map and load the module.
	const busModuleKey = `${machine.bus.path}.ts`;
	const busModuleLoader = busModules[busModuleKey];
	if (!busModuleLoader) {
		console.error(`Worker: Could not find a bus module loader for key: ${busModuleKey}`);
		return;
	}

	const BusModule = await busModuleLoader();
	const exportedBusEntry = Object.entries(BusModule as object).find(([name]) => name === machine.bus.class);
	if (!exportedBusEntry) {
		console.error(`Worker: Could not find class ${machine.bus.class} for module ${busModuleKey}`);
		return;
	}

	const [, BusClass]: [string, new (mem: Uint8Array) => IBus] = exportedBusEntry;
	const bus = new BusClass(memoryView as Uint8Array);

	if (machine.video) {
		const videoBufferOffset = MEMORY_OFFSET + machine.memory.size;
		videoView = new Uint8Array(sharedBuffer, videoBufferOffset, machine.video.size);

		const videoModuleKey = `${machine.video.path}.ts`;
		const videoModuleLoader = videoModules[videoModuleKey];
		if (!videoModuleLoader) {
			console.error(`Worker: Could not find a video module loader for key: ${videoModuleKey}`);
		} else {
			const VideoModule = await videoModuleLoader();
			const exportedVideoEntry = Object.entries(VideoModule as object).find(([name]) => name === machine.video?.class);

			if (!exportedVideoEntry) {
				console.error(`Worker: Could not find class ${machine.video.class} for module ${videoModuleKey}`);
			} else {
				const [, VideoClass]: [string, new (buffer: Uint8Array, width: number, height: number) => Video] = exportedVideoEntry;
				video = new VideoClass(videoView, machine.video.width, machine.video.height);
			}
		}
	}

	initCPU(bus, registersView as DataView, video);

	console.log(`Worker: Initialized with ${machine.name} machine configuration.`);
}

self.onmessage = async (event: MessageEvent) => {
	const { command, buffer, speed, machine } = event.data;

	if (command === "init") return init(buffer, machine);

	if (!sharedBuffer || !registersView || !memoryView) {
		console.error("Worker: Not initialized. Send 'init' command with buffer first.");
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
				console.log(`Worker: Clock speed set to ${speed} MHz.`);
			}
			break;
		case "reset":
			if (video) video.reset();
			resetCPU();
			break;
		case "addBP":
			addBreakpoint(event.data.type, event.data.address);
			break;
		case "removeBP":
			removeBreakpoint(event.data.type, event.data.address);
			break;
		case "clearBPs":
			clearBreakpoints();
			break;
	}
};
