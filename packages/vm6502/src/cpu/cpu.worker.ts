import type { IBus } from "./bus.interface";
import { initCPU, resetCPU, setClockSpeed, setRunning, stepInstruction } from "./cpu.65c02";
import { MEMORY_OFFSET } from "./shared-memory";

console.log("CPU Worker script loaded.");

// --- Worker State ---
let sharedBuffer: SharedArrayBuffer | null = null;
let memoryView: Uint8Array | null = null;
let registersView: DataView | null = null;

// Vite-specific way to handle dynamic imports in workers.
// This creates a map of all possible bus modules that can be loaded.
// The `eager: false` ensures they are code-split and loaded on demand.
const busModules = import.meta.glob("../machines/*/bus.class.ts");

self.onmessage = (event: MessageEvent) => {
	const { command, buffer, speed, machine } = event.data;

	if (command === "init") {
		console.log("Worker: Initializing with SharedArrayBuffer.");
		if (buffer instanceof SharedArrayBuffer) {
			sharedBuffer = buffer;
			registersView = new DataView(sharedBuffer, 0, MEMORY_OFFSET);
			// The memory size can now be determined by the machine config
			memoryView = new Uint8Array(sharedBuffer, MEMORY_OFFSET, machine.memory.size);

			// Construct the key for the busModules map and load the module.
			const busModuleKey = `${machine.busPath}.ts`;
			const busModuleLoader = busModules[busModuleKey];

			if (busModuleLoader) {
				busModuleLoader()
					.then((busModule) => {
						// The bus class is the first (and only) export in the module.
						const BusClass = Object.values(busModule as object)[0] as new (mem: Uint8Array) => IBus;
						const bus = new BusClass(memoryView as Uint8Array);
						initCPU(bus, registersView as DataView);
						console.log(`Worker: Initialized with ${machine.name} machine configuration.`);
					})
					.catch((err) => {
						console.error(`Worker: Error loading bus module for ${machine.name}:`, err);
					});
			} else {
				console.error(`Worker: Could not find a bus module loader for key: ${busModuleKey}`);
			}
		} else {
			console.error("Worker: Did not receive a SharedArrayBuffer.");
		}
		return;
	}

	if (!sharedBuffer || !registersView || !memoryView) {
		console.error("Worker: Not initialized. Send 'init' command with buffer first.");
		return;
	}

	// console.log(`Worker: Received command '${command}'`);

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
		case "setSpeed":
			if (typeof speed === "number" && speed > 0) {
				setClockSpeed(speed);
				// Log here as emulator.ts doesn't have direct console access for worker
				console.log(`Worker: Clock speed set to ${speed} MHz.`);
			}
			break;
		case "reset":
			resetCPU();
			break;
	}
};
