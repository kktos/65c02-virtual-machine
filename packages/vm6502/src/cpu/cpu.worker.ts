import { Bus } from "./bus";
import { initEmulator, setClockSpeed, setRunning } from "./emulator";
import { MEMORY_OFFSET, MEMORY_SIZE, REG_A_OFFSET, REG_PC_OFFSET } from "./shared-memory";

console.log("CPU Worker script loaded.");

// --- Worker State ---
let sharedBuffer: SharedArrayBuffer | null = null;
let memoryView: Uint8Array | null = null; // Still needed for initialization
let registersView: DataView | null = null; // Still needed for initialization

self.onmessage = (event: MessageEvent) => {
	const { command, buffer, speed } = event.data;

	if (command === "init") {
		console.log("Worker: Initializing with SharedArrayBuffer.");
		if (buffer instanceof SharedArrayBuffer) {
			sharedBuffer = buffer;
			registersView = new DataView(sharedBuffer, 0, MEMORY_OFFSET);
			memoryView = new Uint8Array(sharedBuffer, MEMORY_OFFSET, MEMORY_SIZE);

			// Example: Initialize some values from the worker side
			// Initialize the emulator module with the shared memory views
			const bus = new Bus(memoryView);
			initEmulator(bus, registersView);
			registersView.setUint8(REG_A_OFFSET, 0x00); // Set Register A
			registersView.setUint16(REG_PC_OFFSET, 0x0600, true); // Set PC (little-endian)
		} else {
			console.error("Worker: Did not receive a SharedArrayBuffer.");
		}
		return;
	}

	if (!sharedBuffer || !registersView || !memoryView) {
		console.error("Worker: Not initialized. Send 'init' command with buffer first.");
		return;
	}

	console.log(`Worker: Received command '${command}'`);

	switch (command) {
		case "run":
			setRunning(true);
			break;
		case "pause":
			setRunning(false);
			break;
		case "setSpeed":
			if (typeof speed === "number" && speed > 0) {
				setClockSpeed(speed);
				// Log here as emulator.ts doesn't have direct console access for worker
				console.log(`Worker: Clock speed set to ${speed} MHz.`);
			}
			break;
	}
};
