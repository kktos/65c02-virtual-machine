import type { MachineConfig, VideoConfig } from "@/machines/machine.interface";
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
// let videoView: Uint8Array | null = null;
let video: Video | null = null;
let bus: IBus | null = null;

const MachinesBasePath = "../machines";

// Vite-specific way to handle dynamic imports in workers.
const busModules = import.meta.glob("../machines/*/*.bus.ts");
async function loadBus(busConfig: MachineConfig["bus"]) {
	const busModuleKey = `${MachinesBasePath}/${busConfig.path}.ts`;
	const busModuleLoader = busModules[busModuleKey];
	if (!busModuleLoader) {
		console.error(`Worker: Could not find a bus module loader for key: ${busModuleKey}`);
		return null;
	}
	const BusModule = await busModuleLoader();
	const exportedBusEntry = Object.entries(BusModule as object).find(([name]) => name === busConfig.class);
	if (!exportedBusEntry) {
		console.error(`Worker: Could not find class ${busConfig.class} for module ${busModuleKey}`);
		return null;
	}
	const [, BusClass]: [string, new (mem: Uint8Array) => IBus] = exportedBusEntry;
	return new BusClass(memoryView as Uint8Array);
}

// Vite-specific way to handle dynamic imports in workers.
const videoModules = import.meta.glob("../machines/*/*.video.ts");
async function loadVideo(videoConfig: VideoConfig) {
	// const videoBufferOffset = MEMORY_OFFSET + machine.memory.size;
	// videoView = new Uint8Array(sharedBuffer, videoBufferOffset, machine.video.size);
	if (!(videoConfig.buffer instanceof SharedArrayBuffer)) {
		console.error("Worker: Did not receive a video SharedArrayBuffer.");
		return null;
	}

	const videoModuleKey = `${MachinesBasePath}/${videoConfig.path}.ts`;
	const videoModuleLoader = videoModules[videoModuleKey];
	if (!videoModuleLoader) {
		console.error(`Worker: Could not find a video module loader for key: ${videoModuleKey}`);
		return null;
	}
	const VideoModule = await videoModuleLoader();
	const exportedVideoEntry = Object.entries(VideoModule as object).find(([name]) => name === videoConfig?.class);
	if (!exportedVideoEntry) {
		console.error(`Worker: Could not find class ${videoConfig.class} for module ${videoModuleKey}`);
		return null;
	}
	const [, VideoClass]: [string, new (parent: typeof self, mem: Uint8Array, width: number, height: number) => Video] =
		exportedVideoEntry;

	const videoMemory = new Uint8Array(videoConfig.buffer, 0, videoConfig.width * videoConfig.height);
	return new VideoClass(self, videoMemory, videoConfig.width, videoConfig.height);
}

async function init(machine: MachineConfig) {
	if (!(machine.memory.buffer instanceof SharedArrayBuffer)) {
		console.error("Worker: Did not receive a SharedArrayBuffer.");
		return;
	}

	sharedBuffer = machine.memory.buffer;
	registersView = new DataView(sharedBuffer, 0, MEMORY_OFFSET);
	memoryView = new Uint8Array(sharedBuffer, MEMORY_OFFSET, machine.memory.size);

	bus = await loadBus(machine.bus);
	if (!bus) return;

	if (machine.memory.chunks) {
		for (const chunk of machine.memory.chunks) {
			const data = chunk.data as Uint8Array;
			bus.load(chunk.addr, data, chunk.bank, chunk.tag);
		}
	}

	if (machine.video) {
		video = await loadVideo(machine.video);
		if (!video) return;
	}

	initCPU(bus, registersView, video, memoryView);

	console.log(`Worker: Initialized with ${machine.name} machine configuration.`);
}

self.onmessage = async (event: MessageEvent) => {
	const { command, speed, machine, key } = event.data;

	if (command === "init") return init(machine);

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
		case "keydown":
			if (bus?.pressKey) bus.pressKey(key);
			break;
	}
};
