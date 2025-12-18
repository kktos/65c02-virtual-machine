import type { IBus } from "./bus.interface";
import {
	FLAG_N_MASK,
	FLAG_Z_MASK,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "./shared-memory";

const STACK_PAGE_HI = 0x0100;

// --- Emulator State ---
let isRunning = false;
let clockSpeedMhz = 1; // Default to 1 MHz
let cyclesPerTimeslice = 10000; // Number of cycles to run before yielding

// Shared memory references, to be initialized from the worker
let registersView: DataView | null = null;
let bus: IBus | null = null;

// Status Flag Masks (complementing those from shared-memory)
const FLAG_C_MASK = 0x01;
const FLAG_I_MASK = 0x04;
const FLAG_D_MASK = 0x08;
// const FLAG_B_MASK = 0x10;
const FLAG_V_MASK = 0x40;

export const initEmulator = (systemBus: IBus, regView: DataView) => {
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
			// --- BRK ---
			case 0x00: {
				// BRK
				// Note: Actual interrupt sequence is handled by CPU, this is a placeholder
				isRunning = false;
				break;
			}
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
			case 0xbd: {
				// LDA Absolute,X
				const baseAddr = bus.read(pc) | (bus.read(pc + 1) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xb9: {
				// LDA Absolute,Y
				const baseAddr = bus.read(pc) | (bus.read(pc + 1) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xa5: {
				// LDA Zero Page
				const addr = bus.read(pc);
				pc++;
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 3;
				break;
			}
			case 0xb5: {
				// LDA Zero Page,X
				const zeroPageAddr = bus.read(pc);
				pc++;
				const addr = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4;
				break;
			}
			case 0xa1: {
				// LDA (Indirect,X)
				const zeroPageAddr = bus.read(pc);
				pc++;
				const pointer = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 6;
				break;
			}
			case 0xb1: {
				// LDA (Indirect),Y
				const zeroPageAddr = bus.read(pc);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
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
			case 0x9d: {
				// STA Absolute,X
				const baseAddr = bus.read(pc) | (bus.read(pc + 1) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 5;
				break;
			}
			case 0x99: {
				// STA Absolute,Y
				const baseAddr = bus.read(pc) | (bus.read(pc + 1) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 5;
				break;
			}
			case 0x85: {
				// STA Zero Page
				const addr = bus.read(pc);
				pc++;
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 3;
				break;
			}
			case 0x95: {
				// STA Zero Page,X
				const zeroPageAddr = bus.read(pc);
				pc++;
				const addr = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 4;
				break;
			}
			case 0x81: {
				// STA (Indirect,X)
				const zeroPageAddr = bus.read(pc);
				pc++;
				const pointer = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 6;
				break;
			}
			case 0x91: {
				// STA (Indirect),Y
				const zeroPageAddr = bus.read(pc);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 6;
				break;
			}

			// --- Register Transfers ---
			case 0xaa: {
				// TAX
				const value = registersView.getUint8(REG_A_OFFSET);
				registersView.setUint8(REG_X_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}
			case 0xa8: {
				// TAY
				const value = registersView.getUint8(REG_A_OFFSET);
				registersView.setUint8(REG_Y_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}
			case 0x8a: {
				// TXA
				const value = registersView.getUint8(REG_X_OFFSET);
				registersView.setUint8(REG_A_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}
			case 0x98: {
				// TYA
				const value = registersView.getUint8(REG_Y_OFFSET);
				registersView.setUint8(REG_A_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}

			// --- Stack Operations ---
			case 0x9a: {
				// TXS
				registersView.setUint8(REG_SP_OFFSET, registersView.getUint8(REG_X_OFFSET));
				cycles = 2;
				break;
			}
			case 0xba: {
				// TSX
				const value = registersView.getUint8(REG_SP_OFFSET);
				registersView.setUint8(REG_X_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}
			case 0x48: {
				// PHA
				let s = registersView.getUint8(REG_SP_OFFSET);
				bus.write(STACK_PAGE_HI | s, registersView.getUint8(REG_A_OFFSET));
				s--;
				registersView.setUint8(REG_SP_OFFSET, s);
				cycles = 3;
				break;
			}
			case 0x68: {
				// PLA
				let s = registersView.getUint8(REG_SP_OFFSET);
				s++;
				registersView.setUint8(REG_SP_OFFSET, s);
				const value = bus.read(STACK_PAGE_HI | s);
				registersView.setUint8(REG_A_OFFSET, value);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
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
			case 0x20: {
				// JSR Absolute
				const targetAddr = bus.read(pc) | (bus.read(pc + 1) << 8);
				pc += 2;
				const returnAddr = pc - 1;
				let s = registersView.getUint8(REG_SP_OFFSET);
				bus.write(STACK_PAGE_HI | s, (returnAddr >> 8) & 0xff);
				s--;
				bus.write(STACK_PAGE_HI | s, returnAddr & 0xff);
				s--;
				registersView.setUint8(REG_SP_OFFSET, s);
				pc = targetAddr;
				cycles = 6;
				break;
			}
			case 0x60: {
				// RTS
				let s = registersView.getUint8(REG_SP_OFFSET);
				s++;
				const lo = bus.read(STACK_PAGE_HI | s);
				s++;
				const hi = bus.read(STACK_PAGE_HI | s);
				registersView.setUint8(REG_SP_OFFSET, s);
				pc = ((hi << 8) | lo) + 1;
				cycles = 6;
				break;
			}

			// --- Branching ---
			case 0x90: // BCC
			case 0xb0: // BCS
			case 0xf0: // BEQ
			case 0xd0: // BNE
			case 0x30: // BMI
			case 0x10: // BPL
			case 0x50: // BVC
			case 0x70: {
				// BVS
				const offset = bus.read(pc);
				pc++;
				const status = registersView.getUint8(REG_STATUS_OFFSET);
				let branch = false;
				switch (opcode) {
					case 0x90:
						branch = !(status & FLAG_C_MASK);
						break; // BCC
					case 0xb0:
						branch = !!(status & FLAG_C_MASK);
						break; // BCS
					case 0xf0:
						branch = !!(status & FLAG_Z_MASK);
						break; // BEQ
					case 0xd0:
						branch = !(status & FLAG_Z_MASK);
						break; // BNE
					case 0x30:
						branch = !!(status & FLAG_N_MASK);
						break; // BMI
					case 0x10:
						branch = !(status & FLAG_N_MASK);
						break; // BPL
					case 0x50:
						branch = !(status & FLAG_V_MASK);
						break; // BVC
					case 0x70:
						branch = !!(status & FLAG_V_MASK);
						break; // BVS
				}

				if (branch) {
					cycles = 3; // Base for branch taken
					const branchAddr = pc + (offset < 0x80 ? offset : offset - 0x100);
					if ((pc & 0xff00) !== (branchAddr & 0xff00)) {
						cycles++; // Add cycle for page cross
					}
					pc = branchAddr;
				} else {
					cycles = 2; // Branch not taken
				}
				break;
			}

			// --- Status Flag Changes ---
			case 0x18: {
				// CLC
				registersView.setUint8(REG_STATUS_OFFSET, registersView.getUint8(REG_STATUS_OFFSET) & ~FLAG_C_MASK);
				cycles = 2;
				break;
			}
			case 0x38: {
				// SEC
				registersView.setUint8(REG_STATUS_OFFSET, registersView.getUint8(REG_STATUS_OFFSET) | FLAG_C_MASK);
				cycles = 2;
				break;
			}
			case 0x58: {
				// CLI
				registersView.setUint8(REG_STATUS_OFFSET, registersView.getUint8(REG_STATUS_OFFSET) & ~FLAG_I_MASK);
				cycles = 2;
				break;
			}
			case 0x78: {
				// SEI
				registersView.setUint8(REG_STATUS_OFFSET, registersView.getUint8(REG_STATUS_OFFSET) | FLAG_I_MASK);
				cycles = 2;
				break;
			}
			case 0xb8: {
				// CLV
				registersView.setUint8(REG_STATUS_OFFSET, registersView.getUint8(REG_STATUS_OFFSET) & ~FLAG_V_MASK);
				cycles = 2;
				break;
			}
			case 0xd8: {
				// CLD
				registersView.setUint8(REG_STATUS_OFFSET, registersView.getUint8(REG_STATUS_OFFSET) & ~FLAG_D_MASK);
				cycles = 2;
				break;
			}
			case 0xf8: {
				// SED
				registersView.setUint8(REG_STATUS_OFFSET, registersView.getUint8(REG_STATUS_OFFSET) | FLAG_D_MASK);
				cycles = 2;
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
