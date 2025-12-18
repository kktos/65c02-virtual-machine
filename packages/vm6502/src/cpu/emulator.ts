import type { Bus } from "./bus";
import { FLAG_N_MASK, FLAG_Z_MASK, REG_A_OFFSET, REG_PC_OFFSET, REG_STATUS_OFFSET } from "./shared-memory";

// --- Emulator State ---
let isRunning = false;
let clockSpeedMhz = 1; // Default to 1 MHz
let cyclesPerTimeslice = 10000; // Number of cycles to run before yielding

// Shared memory references, to be initialized from the worker
let registersView: DataView | null = null;
let bus: Bus | null = null;

export const initEmulator = (systemBus: Bus, regView: DataView) => {
	bus = systemBus;
	registersView = regView;
	updateCyclesPerTimeslice();
};

export const setRunning = (running: boolean) => {
	isRunning = running;
	if (isRunning) run();
};

export const setClockSpeed = (speed: number) => {
	if (speed > 0) {
		clockSpeedMhz = speed;
		updateCyclesPerTimeslice();
	}
};

const updateCyclesPerTimeslice = () => {
	// Run for approx 10ms per timeslice
	cyclesPerTimeslice = clockSpeedMhz * 1000000 * 0.01;
};

// --- Main Execution Loop ---
const run = () => {
	if (!isRunning || !registersView || !bus) return;

	let cyclesThisSlice = cyclesPerTimeslice;

	while (cyclesThisSlice > 0) {
		let pc = registersView.getUint16(REG_PC_OFFSET, true);
		const opcode = bus.read(pc);
		pc++;

		let cycles = 2; // Default cycles, will be overridden

		// This is the core of the emulator. For performance, logic is kept inline
		// inside the switch cases, avoiding function calls where possible.
		switch (opcode) {
			// --- Load/Store Operations ---
			case 0xa9: {
				// LDA #Immediate
				const value = bus.read(pc);
				pc++;
				registersView.setUint8(REG_A_OFFSET, value);
				// Update Flags
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}
			case 0xad: {
				// LDA Absolute
				const addr = bus.read(pc) | (bus.read(pc + 1) << 8);
				pc += 2;
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				// Update Flags
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4;
				break;
			}
			case 0x8d: {
				// STA Absolute
				const addr = bus.read(pc) | (bus.read(pc + 1) << 8);
				pc += 2;
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 4;
				break;
			}

			// --- Jumps & Calls ---
			case 0x4c: {
				// JMP Absolute
				const addr = bus.read(pc) | (bus.read(pc + 1) << 8);
				pc = addr;
				cycles = 3;
				break;
			}

			// --- No Operation ---
			case 0xea: {
				// NOP
				cycles = 2;
				break;
			}

			default:
				console.error(
					`Emulator: Unimplemented opcode ${opcode.toString(16).toUpperCase()} at address $${(pc - 1).toString(16).toUpperCase()}`,
				);
				isRunning = false; // Stop on unimplemented opcode
				break;
		}

		registersView.setUint16(REG_PC_OFFSET, pc, true);
		cyclesThisSlice -= cycles;

		if (!isRunning) break;
	}

	// Yield to the event loop and schedule the next run
	setTimeout(run, 0);
};
