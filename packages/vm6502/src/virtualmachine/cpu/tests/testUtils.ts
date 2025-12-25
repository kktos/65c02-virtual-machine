import { initEmulator, setRunning } from "../cpu.6502";
import {
	FLAG_B_MASK,
	FLAG_C_MASK,
	FLAG_D_MASK,
	FLAG_I_MASK,
	FLAG_N_MASK,
	FLAG_V_MASK,
	FLAG_Z_MASK,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "../shared-memory";
import { MockBus } from "./mockBus";

// Re-export flags for easy access in tests
export const C = FLAG_C_MASK;
export const Z = FLAG_Z_MASK;
export const I = FLAG_I_MASK;
export const D = FLAG_D_MASK;
export const B = FLAG_B_MASK;
export const V = FLAG_V_MASK;
export const N = FLAG_N_MASK;

export interface CpuState {
	a?: number;
	x?: number;
	y?: number;
	sp?: number;
	pc?: number;
	status?: number;
}

export interface TestContext {
	bus: MockBus;
	registersView: DataView;
}

/**
 * Sets up the CPU with a given initial state for a test.
 * @param initialState Optional initial values for registers.
 * @returns A context object with the bus and register view.
 */
export const setupCpu = (initialState: CpuState = {}): TestContext => {
	// The shared buffer size doesn't matter for these tests, as we don't use the memory section of it.
	const sharedBuffer = new ArrayBuffer(256);
	const registersView = new DataView(sharedBuffer);
	const bus = new MockBus();

	// Initialize registers to defaults or provided values
	registersView.setUint8(REG_A_OFFSET, initialState.a ?? 0);
	registersView.setUint8(REG_X_OFFSET, initialState.x ?? 0);
	registersView.setUint8(REG_Y_OFFSET, initialState.y ?? 0);
	registersView.setUint8(REG_SP_OFFSET, initialState.sp ?? 0xfd); // Default stack pointer
	registersView.setUint16(REG_PC_OFFSET, initialState.pc ?? 0x0600, true); // Default PC
	registersView.setUint8(REG_STATUS_OFFSET, initialState.status ?? 0x24); // Default status (I=1, Unused=1)

	initEmulator(bus, registersView);
	setRunning(false); // Ensure it's not running automatically

	return { bus, registersView };
};

/**
 * Helper to check if a specific flag is set in the status register.
 */
export const getFlag = (status: number, flagMask: number): boolean => {
	return (status & flagMask) !== 0;
};
