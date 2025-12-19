import type { Breakpoint } from "@/types/breakpoint.interface";
import type { IBus } from "./bus.interface";
import {
	FLAG_5_MASK,
	FLAG_B_MASK,
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

// --- Breakpoint State ---
const pcBreakpoints = new Set<number>();
const memoryReadBreakpoints = new Set<number>();
const memoryWriteBreakpoints = new Set<number>();
const memoryAccessBreakpoints = new Set<number>();

// Shared memory references, to be initialized from the worker
let registersView: DataView | null = null;
let bus: IBus | null = null;

// Status Flag Masks (complementing those from shared-memory)
const FLAG_C_MASK = 0x01;
const FLAG_I_MASK = 0x04;
const FLAG_D_MASK = 0x08;
// const FLAG_B_MASK = 0x10;
const FLAG_V_MASK = 0x40;

export function initCPU(systemBus: IBus, regView: DataView) {
	bus = systemBus;
	registersView = regView;
	updateCyclesPerTimeslice();

	// Wrap bus methods to check for breakpoints
	const originalRead = bus.read.bind(bus);
	bus.read = (address: number, isOpcodeFetch = false): number => {
		const value = originalRead(address, isOpcodeFetch);
		if (!isOpcodeFetch && isRunning) {
			if (memoryReadBreakpoints.has(address) || memoryAccessBreakpoints.has(address)) {
				setRunning(false);
				self.postMessage({ type: "breakpointHit", breakpointType: "read", address });
			}
		}
		return value;
	};

	const originalWrite = bus.write.bind(bus);
	bus.write = (address: number, value: number): void => {
		originalWrite(address, value);

		const pc = registersView?.getUint16(REG_PC_OFFSET, true);

		console.log(
			`${pc?.toString(16).padStart(4, "0")} write ${address.toString(16).padStart(4, "0")}:${(value & 0xff).toString(16).padStart(2, "0")}`,
		);

		if (isRunning) {
			if (memoryWriteBreakpoints.has(address) || memoryAccessBreakpoints.has(address)) {
				setRunning(false);
				self.postMessage({ type: "breakpointHit", breakpointType: "write", address });
			}
		}
	};

	resetCPU();
}

export function setRunning(running: boolean) {
	isRunning = running;
	self.postMessage({ type: "isRunning", isRunning: running });
	if (isRunning) run();
}

export function setClockSpeed(speed: number) {
	if (speed > 0) {
		clockSpeedMhz = speed;
		updateCyclesPerTimeslice();
	}
}

function updateCyclesPerTimeslice() {
	// Run for approx 10ms per timeslice
	cyclesPerTimeslice = clockSpeedMhz * 1000000 * 0.01;
}

export function addBreakpoint(type: Breakpoint["type"], address: number) {
	switch (type) {
		case "pc":
			pcBreakpoints.add(address);
			break;
		case "read":
			memoryReadBreakpoints.add(address);
			break;
		case "write":
			memoryWriteBreakpoints.add(address);
			break;
		case "access":
			memoryAccessBreakpoints.add(address);
			break;
	}
}

export function removeBreakpoint(type: Breakpoint["type"], address: number) {
	switch (type) {
		case "pc":
			pcBreakpoints.delete(address);
			break;
		case "read":
			memoryReadBreakpoints.delete(address);
			break;
		case "write":
			memoryWriteBreakpoints.delete(address);
			break;
		case "access":
			memoryAccessBreakpoints.delete(address);
			break;
	}
}

export function clearBreakpoints() {
	pcBreakpoints.clear();
	memoryReadBreakpoints.clear();
	memoryWriteBreakpoints.clear();
	memoryAccessBreakpoints.clear();
}

export function stepInstruction() {
	if (!isRunning) executeInstruction();
}

export function resetCPU() {
	if (!registersView || !bus) return;

	// The 6502's reset sequence
	// Set Stack Pointer to 0xFD
	registersView.setUint8(REG_SP_OFFSET, 0xfd);

	// Set the Interrupt Disable flag
	let status = registersView.getUint8(REG_STATUS_OFFSET);
	status |= FLAG_I_MASK;
	registersView.setUint8(REG_STATUS_OFFSET, status);

	// Read the reset vector from memory ($FFFC and $FFFD)
	const lo = bus.read(0xfffc);
	const hi = bus.read(0xfffd);
	registersView.setUint16(REG_PC_OFFSET, (hi << 8) | lo, true);

	// Stop execution
	setRunning(false);
}

// --- Main Execution Loop ---
function run() {
	if (!isRunning || !registersView || !bus) return;
	let cyclesThisSlice = cyclesPerTimeslice;

	while (cyclesThisSlice > 0) {
		// let pc = registersView.getUint16(REG_PC_OFFSET, true);
		// const opcode = bus.read(pc);
		// pc++;

		const cycles = executeInstruction();
		cyclesThisSlice -= cycles;

		if (!isRunning) break;
	}

	// Yield to the event loop and schedule the next run
	if (isRunning) setTimeout(run, 0);
}

function setNZFlags(value: number) {
	if (!registersView) return;
	let status = registersView.getUint8(REG_STATUS_OFFSET);
	status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
	status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
	registersView.setUint8(REG_STATUS_OFFSET, status);
}

function adc(value: number) {
	if (!registersView) return;
	const accumulator = registersView.getUint8(REG_A_OFFSET);
	let status = registersView.getUint8(REG_STATUS_OFFSET);
	const carry = status & FLAG_C_MASK;

	if (status & FLAG_D_MASK) {
		// Decimal Mode
		let al = (accumulator & 0x0f) + (value & 0x0f) + carry;
		if (al > 9) al += 6;

		let ah = (accumulator >> 4) + (value >> 4) + (al > 0x0f ? 1 : 0);

		// N, V, Z flags are set based on the binary result before BCD correction
		const binaryResult = accumulator + value + carry;
		status = binaryResult & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
		status =
			~(accumulator ^ value) & (accumulator ^ binaryResult) & 0x80 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

		if (ah > 9) ah += 6;

		const result = (ah << 4) | (al & 0x0f);
		status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
		status = ah > 0x0f ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;

		registersView.setUint8(REG_A_OFFSET, result & 0xff);
		registersView.setUint8(REG_STATUS_OFFSET, status);
	} else {
		// Binary Mode
		const result = accumulator + value + carry;
		status = ~(accumulator ^ value) & (accumulator ^ result) & 0x80 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;
		status = result > 0xff ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;

		registersView.setUint8(REG_A_OFFSET, result & 0xff);
		setNZFlags(result & 0xff); // Set N and Z based on final 8-bit result
		registersView.setUint8(REG_STATUS_OFFSET, status); // Apply V and C
	}
}

function sbc(value: number) {
	if (!registersView) return;
	const accumulator = registersView.getUint8(REG_A_OFFSET);
	let status = registersView.getUint8(REG_STATUS_OFFSET);
	const carry = status & FLAG_C_MASK ? 0 : 1; // Inverted for subtraction

	if (status & FLAG_D_MASK) {
		// Decimal Mode
		let al = (accumulator & 0x0f) - (value & 0x0f) - carry;
		if (al < 0) al -= 6;

		let ah = (accumulator >> 4) - (value >> 4) - (al < 0 ? 1 : 0);

		// N, V, Z flags are set based on the binary result before BCD correction
		const binaryResult = accumulator - value - carry;
		status = binaryResult & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
		status = (accumulator ^ value) & (accumulator ^ binaryResult) & 0x80 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

		if (ah < 0) ah -= 6;

		const result = (ah << 4) | (al & 0x0f);
		status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
		status = binaryResult >= 0 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;

		registersView.setUint8(REG_A_OFFSET, result & 0xff);
		registersView.setUint8(REG_STATUS_OFFSET, status);
	} else {
		// Binary Mode
		const result = accumulator - value - carry;
		status = (accumulator ^ value) & (accumulator ^ result) & 0x80 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;
		status = result >= 0 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;

		registersView.setUint8(REG_A_OFFSET, result & 0xff);
		setNZFlags(result & 0xff); // Set N and Z based on final 8-bit result
		registersView.setUint8(REG_STATUS_OFFSET, status); // Apply V and C
	}
}

function and(value: number) {
	if (!registersView) return;
	const accumulator = registersView.getUint8(REG_A_OFFSET);
	const result = accumulator & value;
	registersView.setUint8(REG_A_OFFSET, result);
	setNZFlags(result);
}

function ora(value: number) {
	if (!registersView) return;
	const accumulator = registersView.getUint8(REG_A_OFFSET);
	const result = accumulator | value;
	registersView.setUint8(REG_A_OFFSET, result);
	setNZFlags(result);
}

function eor(value: number) {
	if (!registersView) return;
	const accumulator = registersView.getUint8(REG_A_OFFSET);
	const result = accumulator ^ value;
	registersView.setUint8(REG_A_OFFSET, result);
	setNZFlags(result);
}

function asl(value: number): number {
	if (!registersView) return value;
	let status = registersView.getUint8(REG_STATUS_OFFSET);
	status = value & 0x80 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
	const result = (value << 1) & 0xff;
	status = result === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
	status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
	registersView.setUint8(REG_STATUS_OFFSET, status);
	return result;
}

function executeInstruction(): number {
	if (!registersView || !bus) return 0;

	let pc = registersView.getUint16(REG_PC_OFFSET, true);

	// Check for PC breakpoint before executing
	// Only halt if we are in "run" mode. If we are single-stepping, we want to execute the instruction.
	if (isRunning && pcBreakpoints.has(pc)) {
		setRunning(false);
		self.postMessage({ type: "breakpointHit", breakpointType: "pc", address: pc });
		return 0;
	}

	const opcode = bus.read(pc, true); // Opcode fetch (SYNC)
	pc++;

	let cycles = 2; // Default cycles, will be overridden

	// This is the core of the emulator. For performance, logic is kept inline
	// inside the switch cases, avoiding function calls where possible.
	try {
		switch (opcode) {
			// --- BRK ---
			case 0x00: {
				// BRK

				{
					let s = registersView.getUint8(REG_SP_OFFSET);

					// Push PC + 1
					pc++;
					const hi = pc >> 8;
					const lo = pc & 0x00ff;
					bus.write(STACK_PAGE_HI | s, hi);
					s = (s - 1) & 0xff;
					bus.write(STACK_PAGE_HI | s, lo);
					s = (s - 1) & 0xff;

					// PHP (Push Processor Status)
					const status = registersView.getUint8(REG_STATUS_OFFSET) | FLAG_5_MASK;
					bus.write(STACK_PAGE_HI | s, status);
					s = (s - 1) & 0xff;

					registersView.setUint8(REG_SP_OFFSET, s);
				}

				// reset D flag and set I flag
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = status & ~FLAG_D_MASK;
				// status |= FLAG_B_MASK;
				status |= FLAG_I_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);

				const lo = bus.read(0xfffe);
				const hi = bus.read(0xffff);
				pc = (hi << 8) | lo;

				cycles = 7;
				break;
			}
			case 0x04: {
				// TSB Zero Page (65C02)
				const addr = bus.read(pc, true);
				pc++;
				const memValue = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = (memValue & accumulator) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				bus.write(addr, memValue | accumulator);
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 5;
				break;
			}
			case 0x0c: {
				// TSB Absolute (65C02)
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const memValue = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = (memValue & accumulator) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				bus.write(addr, memValue | accumulator);
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 6;
				break;
			}
			case 0x08: {
				// PHP (Push Processor Status)
				let s = registersView.getUint8(REG_SP_OFFSET);
				// On 65C02, Bit 5 is always 1.
				const status = registersView.getUint8(REG_STATUS_OFFSET) | FLAG_5_MASK;
				bus.write(STACK_PAGE_HI | s, status);
				s = (s - 1) & 0xff;
				registersView.setUint8(REG_SP_OFFSET, s);
				cycles = 3;
				break;
			}
			// --- Logical Operations ---
			case 0x01: {
				// ORA (Indirect,X)
				const pointer = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				ora(bus.read(addr));
				cycles = 6;
				break;
			}
			case 0x05: {
				// ORA Zero Page
				const addr = bus.read(pc, true);
				pc++;
				ora(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0x09: {
				// ORA Immediate
				const value = bus.read(pc, true);
				pc++;
				ora(value);
				cycles = 2;
				break;
			}
			case 0x0d: {
				// ORA Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				ora(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x11: {
				// ORA (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				ora(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x12: {
				// ORA (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				ora(bus.read(addr));
				cycles = 5;
				break;
			}
			case 0x14: {
				// TRB Zero Page (65C02)
				const addr = bus.read(pc, true);
				pc++;
				const memValue = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = (memValue & accumulator) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				bus.write(addr, memValue & ~accumulator);
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 5;
				break;
			}
			case 0x1c: {
				// TRB Absolute (65C02)
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const memValue = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = (memValue & accumulator) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				bus.write(addr, memValue & ~accumulator);
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 6;
				break;
			}
			case 0x15: {
				// ORA Zero Page,X
				const addr = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				ora(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x19: {
				// ORA Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				ora(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x1d: {
				// ORA Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				ora(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x28: {
				// PLP (Pull Processor Status)
				let s = registersView.getUint8(REG_SP_OFFSET);
				s = (s + 1) & 0xff;
				registersView.setUint8(REG_SP_OFFSET, s);
				const pulledStatus = bus.read(STACK_PAGE_HI | s);
				registersView.setUint8(REG_STATUS_OFFSET, pulledStatus | FLAG_B_MASK);
				cycles = 4;
				break;
			}
			case 0x21: {
				// AND (Indirect,X)
				const pointer = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				and(bus.read(addr));
				cycles = 6;
				break;
			}
			// --- Load/Store Operations ---
			case 0xa9: {
				// LDA #Immediate
				const value = bus.read(pc, true);
				pc++;
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xa2: {
				// LDX #Immediate
				const value = bus.read(pc, true);
				pc++;
				registersView.setUint8(REG_X_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xa0: {
				// LDY #Immediate
				const value = bus.read(pc, true);
				pc++;
				registersView.setUint8(REG_Y_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xa6: {
				// LDX Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				registersView.setUint8(REG_X_OFFSET, value);
				setNZFlags(value);
				cycles = 3;
				break;
			}
			case 0xa4: {
				// LDY Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				registersView.setUint8(REG_Y_OFFSET, value);
				setNZFlags(value);
				cycles = 3;
				break;
			}
			case 0xad: {
				// LDA Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xbd: {
				// LDA Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xb9: {
				// LDA Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xa5: {
				// LDA Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 3;
				break;
			}
			case 0xb5: {
				// LDA Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xa1: {
				// LDA (Indirect,X)
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const pointer = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 6;
				break;
			}
			case 0xb1: {
				// LDA (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				const value = bus.read(addr);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xb2: {
				// LDA (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const value = bus.read(addr);

				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 5;
				break;
			}
			case 0xae: {
				// LDX Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				registersView.setUint8(REG_X_OFFSET, value);
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xac: {
				// LDY Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				registersView.setUint8(REG_Y_OFFSET, value);
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xbe: {
				// LDX Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				const value = bus.read(addr);
				registersView.setUint8(REG_X_OFFSET, value);
				setNZFlags(value);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xbc: {
				// LDY Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				const value = bus.read(addr);
				registersView.setUint8(REG_Y_OFFSET, value);
				setNZFlags(value);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xb6: {
				// LDX Zero Page,Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + registersView.getUint8(REG_Y_OFFSET)) & 0xff;
				const value = bus.read(addr);
				registersView.setUint8(REG_X_OFFSET, value);
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xb4: {
				// LDY Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				const value = bus.read(addr);
				registersView.setUint8(REG_Y_OFFSET, value);
				setNZFlags(value);
				cycles = 4;
				break;
			}

			case 0x8d: {
				// STA Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 4;
				break;
			}
			case 0x86: {
				// STX Zero Page
				const addr = bus.read(pc, true);
				pc++;
				bus.write(addr, registersView.getUint8(REG_X_OFFSET));
				cycles = 3;
				break;
			}
			case 0x84: {
				// STY Zero Page
				const addr = bus.read(pc, true);
				pc++;
				bus.write(addr, registersView.getUint8(REG_Y_OFFSET));
				cycles = 3;
				break;
			}
			case 0x8e: {
				// STX Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				bus.write(addr, registersView.getUint8(REG_X_OFFSET));
				cycles = 4;
				break;
			}
			case 0x8c: {
				// STY Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				bus.write(addr, registersView.getUint8(REG_Y_OFFSET));
				cycles = 4;
				break;
			}
			case 0x96: {
				// STX Zero Page,Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + registersView.getUint8(REG_Y_OFFSET)) & 0xff;
				bus.write(addr, registersView.getUint8(REG_X_OFFSET));
				cycles = 4;
				break;
			}
			case 0x94: {
				// STY Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				bus.write(addr, registersView.getUint8(REG_Y_OFFSET));
				cycles = 4;
				break;
			}
			case 0x25: {
				// AND Zero Page
				const addr = bus.read(pc, true);
				pc++;
				and(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0x29: {
				// AND Immediate
				const value = bus.read(pc, true);
				pc++;
				and(value);
				cycles = 2;
				break;
			}
			case 0x2d: {
				// AND Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				and(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x31: {
				// AND (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				and(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x32: {
				// AND (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				and(bus.read(addr));
				cycles = 5;
				break;
			}
			case 0x35: {
				// AND Zero Page,X
				const addr = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				and(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x39: {
				// AND Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				and(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x3d: {
				// AND Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				and(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x40: {
				// RTI (Return from Interrupt)

				let s = registersView.getUint8(REG_SP_OFFSET);

				// PLP (Pull Processor Status)
				s = (s + 1) & 0xff;
				const pulledStatus = bus.read(STACK_PAGE_HI | s);
				registersView.setUint8(REG_STATUS_OFFSET, pulledStatus | FLAG_B_MASK);

				// RTS
				s = (s + 1) & 0xff;
				const lo = bus.read(STACK_PAGE_HI | s);
				s = (s + 1) & 0xff;
				const hi = bus.read(STACK_PAGE_HI | s);
				pc = (hi << 8) | lo;

				registersView.setUint8(REG_SP_OFFSET, s);

				// pc--;

				cycles = 6;
				break;
			}
			case 0x41: {
				// EOR (Indirect,X)
				const pointer = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				eor(bus.read(addr));
				cycles = 6;
				break;
			}
			case 0x45: {
				// EOR Zero Page
				const addr = bus.read(pc, true);
				pc++;
				eor(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0x49: {
				// EOR Immediate
				const value = bus.read(pc, true);
				pc++;
				eor(value);
				cycles = 2;
				break;
			}
			case 0x4d: {
				// EOR Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				eor(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x51: {
				// EOR (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				eor(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x52: {
				// EOR (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				eor(bus.read(addr));
				cycles = 5;
				break;
			}
			case 0x55: {
				// EOR Zero Page,X
				const addr = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				eor(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x59: {
				// EOR Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				eor(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x5d: {
				// EOR Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				eor(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}

			// --- Shift Operations ---
			case 0x0a: {
				// ASL Accumulator
				let value = registersView.getUint8(REG_A_OFFSET);
				value = asl(value);
				registersView.setUint8(REG_A_OFFSET, value);
				cycles = 2;
				break;
			}
			case 0x06: {
				// ASL Zero Page
				const addr = bus.read(pc, true);
				pc++;
				let value = bus.read(addr);
				value = asl(value);
				bus.write(addr, value);
				cycles = 5;
				break;
			}
			case 0x16: {
				// ASL Zero Page,X
				const addr = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				let value = bus.read(addr);
				value = asl(value);
				bus.write(addr, value);
				cycles = 6;
				break;
			}
			case 0x0e: {
				// ASL Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				let value = bus.read(addr);
				value = asl(value);
				bus.write(addr, value);
				cycles = 6;
				break;
			}
			case 0x1e: {
				// ASL Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				let value = bus.read(addr);
				value = asl(value);
				bus.write(addr, value);
				cycles = 7;
				break;
			}

			// --- Arithmetic Operations ---
			case 0x69: {
				// ADC #Immediate
				const value = bus.read(pc, true);
				pc++;
				adc(value);
				cycles = 2;
				break;
			}
			case 0x65: {
				// ADC Zero Page
				const addr = bus.read(pc, true);
				pc++;
				adc(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0x75: {
				// ADC Zero Page,X
				const addr = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				adc(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x6d: {
				// ADC Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				adc(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x7d: {
				// ADC Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				adc(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x79: {
				// ADC Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				adc(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x61: {
				// ADC (Indirect,X)
				const pointer = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				adc(bus.read(addr));
				cycles = 6;
				break;
			}
			case 0x71: {
				// ADC (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				adc(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x72: {
				// ADC (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				adc(bus.read(addr));
				cycles = 5;
				break;
			}

			case 0xe9: {
				// SBC #Immediate
				const value = bus.read(pc, true);
				pc++;
				sbc(value);
				cycles = 2;
				break;
			}
			case 0xe5: {
				// SBC Zero Page
				const addr = bus.read(pc, true);
				pc++;
				sbc(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0xf5: {
				// SBC Zero Page,X
				const addr = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				sbc(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0xed: {
				// SBC Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				sbc(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0xfd: {
				// SBC Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				sbc(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xf9: {
				// SBC Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				sbc(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xe1: {
				// SBC (Indirect,X)
				const pointer = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				sbc(bus.read(addr));
				cycles = 6;
				break;
			}
			case 0xf1: {
				// SBC (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				sbc(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xf2: {
				// SBC (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				sbc(bus.read(addr));
				cycles = 5;
				break;
			}

			case 0xc9: {
				// CMP #Immediate
				const value = bus.read(pc, true);
				pc++;
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				const result = accumulator - value;

				let status = registersView.getUint8(REG_STATUS_OFFSET);

				// Set flags based on comparison
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}

			case 0xc0: {
				// CPY #Immediate
				const value = bus.read(pc, true);
				pc++;
				const yRegister = registersView.getUint8(REG_Y_OFFSET);
				const result = yRegister - value;

				let status = registersView.getUint8(REG_STATUS_OFFSET);

				// Set flags based on comparison
				status = yRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}

			case 0xcc: {
				// CPY Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const yRegister = registersView.getUint8(REG_Y_OFFSET);
				const result = yRegister - value;

				let status = registersView.getUint8(REG_STATUS_OFFSET);

				// Set flags based on comparison
				status = yRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4;
				break;
			}

			case 0x9d: {
				// STA Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 5;
				break;
			}
			case 0x99: {
				// STA Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 5;
				break;
			}
			case 0x85: {
				// STA Zero Page
				const addr = bus.read(pc, true);
				pc++;
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 3;
				break;
			}
			case 0x95: {
				// STA Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 4;
				break;
			}
			case 0x81: {
				// STA (Indirect,X)
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const pointer = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 6;
				break;
			}
			case 0x91: {
				// STA (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 6;
				break;
			}
			case 0x92: {
				// STA (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				bus.write(addr, registersView.getUint8(REG_A_OFFSET));
				cycles = 5;
				break;
			}

			// --- STZ (65C02) ---
			case 0x64: {
				// STZ Zero Page
				const addr = bus.read(pc, true);
				pc++;
				bus.write(addr, 0);
				cycles = 3;
				break;
			}
			case 0x74: {
				// STZ Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				bus.write(addr, 0);
				cycles = 4;
				break;
			}
			case 0x9c: {
				// STZ Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				bus.write(addr, 0);
				cycles = 4;
				break;
			}
			case 0x9e: {
				// STZ Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				bus.write(addr, 0);
				cycles = 5;
				break;
			}

			// --- Register Transfers ---
			case 0xaa: {
				// TAX
				const value = registersView.getUint8(REG_A_OFFSET);
				registersView.setUint8(REG_X_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xa8: {
				// TAY
				const value = registersView.getUint8(REG_A_OFFSET);
				registersView.setUint8(REG_Y_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x8a: {
				// TXA
				const value = registersView.getUint8(REG_X_OFFSET);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x98: {
				// TYA
				const value = registersView.getUint8(REG_Y_OFFSET);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
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
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x48: {
				// PHA
				let s = registersView.getUint8(REG_SP_OFFSET);
				bus.write(STACK_PAGE_HI | s, registersView.getUint8(REG_A_OFFSET));
				s = (s - 1) & 0xff;
				registersView.setUint8(REG_SP_OFFSET, s);
				cycles = 3;
				break;
			}
			case 0x68: {
				// PLA
				let s = registersView.getUint8(REG_SP_OFFSET);
				s = (s + 1) & 0xff;
				registersView.setUint8(REG_SP_OFFSET, s);
				const value = bus.read(STACK_PAGE_HI | s);
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 4;
				break;
			}
			// --- 65C02 Stack Operations ---
			case 0xda: {
				// PHX
				let s = registersView.getUint8(REG_SP_OFFSET);
				bus.write(STACK_PAGE_HI | s, registersView.getUint8(REG_X_OFFSET));
				s = (s - 1) & 0xff;
				registersView.setUint8(REG_SP_OFFSET, s);
				cycles = 3;
				break;
			}
			case 0xfa: {
				// PLX
				let s = registersView.getUint8(REG_SP_OFFSET);
				s = (s + 1) & 0xff;
				registersView.setUint8(REG_SP_OFFSET, s);
				const value = bus.read(STACK_PAGE_HI | s);
				registersView.setUint8(REG_X_OFFSET, value);
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0x5a: {
				// PHY
				let s = registersView.getUint8(REG_SP_OFFSET);
				bus.write(STACK_PAGE_HI | s, registersView.getUint8(REG_Y_OFFSET));
				s = (s - 1) & 0xff;
				registersView.setUint8(REG_SP_OFFSET, s);
				cycles = 3;
				break;
			}
			case 0x7a: {
				// PLY
				let s = registersView.getUint8(REG_SP_OFFSET);
				s = (s + 1) & 0xff;
				registersView.setUint8(REG_SP_OFFSET, s);
				const value = bus.read(STACK_PAGE_HI | s);
				registersView.setUint8(REG_Y_OFFSET, value);
				setNZFlags(value);
				cycles = 4;
				break;
			}

			// --- Increments & Decrements ---
			case 0x3a: {
				// DEC A (65C02)
				let value = registersView.getUint8(REG_A_OFFSET);
				value = (value - 1) & 0xff;
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x1a: {
				// INC A (65C02)
				let value = registersView.getUint8(REG_A_OFFSET);
				value = (value + 1) & 0xff;
				registersView.setUint8(REG_A_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}

			case 0xca: {
				// DEX
				let value = registersView.getUint8(REG_X_OFFSET);
				value = (value - 1) & 0xff;
				registersView.setUint8(REG_X_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xe8: {
				// INX
				let value = registersView.getUint8(REG_X_OFFSET);
				value = (value + 1) & 0xff;
				registersView.setUint8(REG_X_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x88: {
				// DEY
				let value = registersView.getUint8(REG_Y_OFFSET);
				value = (value - 1) & 0xff;
				registersView.setUint8(REG_Y_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xc8: {
				// INY
				let value = registersView.getUint8(REG_Y_OFFSET);
				value = (value + 1) & 0xff;
				registersView.setUint8(REG_Y_OFFSET, value);
				setNZFlags(value);
				cycles = 2;
				break;
			}

			case 0xe6: {
				// INC Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const result = (value + 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 5;
				break;
			}
			case 0xf6: {
				// INC Zero Page,X
				const addr = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				const value = bus.read(addr);
				const result = (value + 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 6;
				break;
			}
			case 0xee: {
				// INC Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const result = (value + 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 6;
				break;
			}
			case 0xfe: {
				// INC Absolute,X
				const addr = (bus.read(pc, true) | (bus.read(pc + 1, true) << 8)) + registersView.getUint8(REG_X_OFFSET);
				pc += 2;
				const value = bus.read(addr);
				const result = (value + 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 7;
				break;
			}

			// --- Jumps & Calls ---
			case 0x4c: {
				// JMP Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc = addr;
				cycles = 3;
				break;
			}
			case 0x6c: {
				// JMP Indirect (6502 bug fixed in 65C02)
				const pointer = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				const addr = bus.read(pointer) | (bus.read(pointer + 1) << 8);
				pc = addr;
				cycles = 6; // 65C02 is 6 cycles, 6502 is 5
				break;
			}
			case 0x7c: {
				// JMP (Absolute,X) (65C02)
				const basePointer = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				const pointer = basePointer + registersView.getUint8(REG_X_OFFSET);
				const addr = bus.read(pointer) | (bus.read(pointer + 1) << 8);
				pc = addr;
				cycles = 6;
				break;
			}
			case 0x20: {
				// JSR Absolute
				const targetAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const returnAddr = pc - 1;
				let s = registersView.getUint8(REG_SP_OFFSET);
				bus.write(STACK_PAGE_HI | s, (returnAddr >> 8) & 0xff);
				s = (s - 1) & 0xff;
				bus.write(STACK_PAGE_HI | s, returnAddr & 0xff);
				s = (s - 1) & 0xff;
				registersView.setUint8(REG_SP_OFFSET, s);
				pc = targetAddr;
				cycles = 6;
				break;
			}
			case 0x60: {
				// RTS
				let s = registersView.getUint8(REG_SP_OFFSET);
				s = (s + 1) & 0xff;
				const lo = bus.read(STACK_PAGE_HI | s);
				s = (s + 1) & 0xff;
				const hi = bus.read(STACK_PAGE_HI | s);
				registersView.setUint8(REG_SP_OFFSET, s);
				pc = ((hi << 8) | lo) + 1;
				cycles = 6;
				break;
			}

			// --- Branching ---
			case 0x80: // BRA (65C02)
			case 0x90: // BCC
			case 0xb0: // BCS
			case 0xf0: // BEQ
			case 0xd0: // BNE
			case 0x30: // BMI
			case 0x10: // BPL
			case 0x50: // BVC
			case 0x70: {
				// BVS
				const offset = bus.read(pc, true);
				pc++;
				const status = registersView.getUint8(REG_STATUS_OFFSET);
				let branch = false;
				switch (opcode) {
					case 0x80:
						branch = true;
						break; // BRA
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

			case 0x24: {
				// BIT Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				let status = registersView.getUint8(REG_STATUS_OFFSET);

				// Z flag is set if A & M is 0
				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				// N and V flags are set from bits 7 and 6 of the memory value
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				status = value & 0x40 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 3;
				break;
			}
			case 0x2c: {
				// BIT Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				let status = registersView.getUint8(REG_STATUS_OFFSET);

				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				status = value & 0x40 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4;
				break;
			}
			case 0x34: {
				// BIT Zero Page,X (65C02)
				const addr = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				let status = registersView.getUint8(REG_STATUS_OFFSET);

				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				status = value & 0x40 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4;
				break;
			}
			case 0x3c: {
				// BIT Absolute,X (65C02)
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				let status = registersView.getUint8(REG_STATUS_OFFSET);

				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				status = value & 0x40 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x89: {
				// BIT Immediate (65C02)
				const value = bus.read(pc, true);
				pc++;
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				let status = registersView.getUint8(REG_STATUS_OFFSET);

				// Only affects Z flag
				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}

			case 0xc1: {
				// CMP (Indirect,X)
				const pointer = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				const result = accumulator - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 6;
				break;
			}
			case 0xc4: {
				// CPY Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const yRegister = registersView.getUint8(REG_Y_OFFSET);
				const result = yRegister - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = yRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 3;
				break;
			}
			case 0xc5: {
				// CMP Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				const result = accumulator - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 3;
				break;
			}
			case 0xcd: {
				// CMP Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				const result = accumulator - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4;
				break;
			}
			case 0xd1: {
				// CMP (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				const result = accumulator - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xd2: {
				// CMP (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				const result = accumulator - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 5;
				break;
			}
			case 0xd5: {
				// CMP Zero Page,X
				const addr = (bus.read(pc, true) + registersView.getUint8(REG_X_OFFSET)) & 0xff;
				pc++;
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				const result = accumulator - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4;
				break;
			}
			case 0xd9: {
				// CMP Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_Y_OFFSET);
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				const result = accumulator - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xdd: {
				// CMP Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + registersView.getUint8(REG_X_OFFSET);
				const value = bus.read(addr);
				const accumulator = registersView.getUint8(REG_A_OFFSET);
				const result = accumulator - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}

			case 0xe0: {
				// CPX #Immediate
				const value = bus.read(pc, true);
				pc++;
				const xRegister = registersView.getUint8(REG_X_OFFSET);
				const result = xRegister - value;

				let status = registersView.getUint8(REG_STATUS_OFFSET);

				// Set flags based on comparison
				status = xRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 2;
				break;
			}

			case 0xe4: {
				// CPX Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const xRegister = registersView.getUint8(REG_X_OFFSET);
				const result = xRegister - value;
				let status = registersView.getUint8(REG_STATUS_OFFSET);
				status = xRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 3;
				break;
			}

			case 0xec: {
				// CPX Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const xRegister = registersView.getUint8(REG_X_OFFSET);
				const result = xRegister - value;

				let status = registersView.getUint8(REG_STATUS_OFFSET);

				// Set flags based on comparison
				status = xRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				registersView.setUint8(REG_STATUS_OFFSET, status);
				cycles = 4;
				break;
			}

			// --- No Operation ---
			case 0xea: {
				// NOP
				// Official NOP
				cycles = 2;
				break;
			}

			// --- BBR/BBS (65C02) ---
			case 0x0f: // BBR0
			case 0x1f: // BBR1
			case 0x2f: // BBR2
			case 0x3f: // BBR3
			case 0x4f: // BBR4
			case 0x5f: // BBR5
			case 0x6f: // BBR6
			case 0x7f: {
				// BBR
				const bit = (opcode & 0x70) >> 4;
				const addr = bus.read(pc, true);
				pc++;
				const offset = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);

				if ((value & (1 << bit)) === 0) {
					// Branch taken
					const branchAddr = pc + (offset < 0x80 ? offset : offset - 0x100);
					// BBR/BBS do not have an extra cycle for page crossing
					pc = branchAddr;
					cycles = 7;
				} else {
					// Branch not taken
					cycles = 5;
				}
				break;
			}
			case 0x8f: // BBS0
			case 0x9f: // BBS1
			case 0xaf: // BBS2
			case 0xbf: // BBS3
			case 0xcf: // BBS4
			case 0xdf: // BBS5
			case 0xef: // BBS6
			case 0xff: {
				// BBS
				const bit = (opcode & 0x70) >> 4;
				const addr = bus.read(pc, true);
				pc++;
				const offset = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);

				if ((value & (1 << bit)) !== 0) {
					// Branch taken
					const branchAddr = pc + (offset < 0x80 ? offset : offset - 0x100);
					// BBR/BBS do not have an extra cycle for page crossing
					pc = branchAddr;
					cycles = 7;
				} else {
					// Branch not taken
					cycles = 5;
				}
				break;
			}

			// --- Undocumented NOPs (65C02) ---
			// These opcodes are defined as NOPs of varying lengths and cycle counts on the 65C02.

			// 1-byte NOPs
			case 0x03:
			case 0x13:
			case 0x23:
			case 0x33:
			case 0x43:
			case 0x53:
			case 0x63:
			case 0x73:
			case 0x83:
			case 0x93:
			case 0xa3:
			case 0xb3:
			case 0xc3:
			case 0xd3:
			case 0xe3:
			case 0xf3:
			case 0x0b:
			case 0x1b:
			case 0x2b:
			case 0x3b:
			case 0x4b:
			case 0x5b:
			case 0x6b:
			case 0x7b:
			case 0x8b:
			case 0x9b:
			case 0xab:
			case 0xbb:
			case 0xcb: // WAI on WDC, NOP on Rockwell
			case 0xdb: // STP on WDC, NOP on Rockwell
			case 0xeb:
			case 0xfb: {
				cycles = 1;
				break;
			}

			// 2-byte NOPs
			case 0x02:
			case 0x22:
			case 0x42:
			case 0x62:
			case 0x82:
			case 0xc2:
			case 0xe2: {
				pc++;
				cycles = 2;
				break;
			}

			// 2-byte, 3-cycle NOPs
			case 0x44: {
				pc++;
				cycles = 3;
				break;
			}

			// 2-byte, 4-cycle NOPs
			case 0xd4:
			case 0xf4:
			case 0x54: {
				pc++;
				cycles = 4;
				break;
			}

			// 3-byte, 8-cycle NOPs
			case 0x5c: {
				pc += 2;
				cycles = 8;
				break;
			}

			// 3-byte, 4-cycle NOPs
			case 0xdc:
			case 0xfc: {
				pc += 2;
				cycles = 8;
				break;
			}

			default: {
				const errorAddress = pc - 1;
				const errorMessage = `Unimplemented opcode ${opcode.toString(16).toUpperCase()} at address $${errorAddress.toString(16).toUpperCase()}`;
				console.error(`Emulator: ${errorMessage}`);

				// Notify the main thread about the error
				self.postMessage({
					type: "error",
					error: "unimplemented_opcode",
					message: errorMessage,
					address: errorAddress,
					opcode: opcode,
				});

				setRunning(false); // Stop on unimplemented opcode
				break;
			}
		}
	} finally {
		registersView.setUint16(REG_PC_OFFSET, pc, true);
	}

	return cycles;
}
