import type { IBus } from "../../../types/bus.interface";
import { initCPU, stepInstruction } from "../cpu.65c02";
import { setRunning } from "../cpu.6502";
import { vi } from "vitest";

/**
 * Memory size for CPU tests (64KB)
 */
export const TEST_MEMORY_SIZE = 0x10000;

/**
 * Stack metadata buffer size for CPU tests
 */
export const TEST_STACK_META_SIZE = 0x100;

/**
 * Register buffer size for CPU tests
 */
export const TEST_REGISTERS_SIZE = 64;

/**
 * Creates a complete mock IBus implementation for CPU testing.
 * All methods are mocked with vi.fn() and memory-backed read/write.
 */
export const createMockBus = (memory: Uint8Array): IBus => ({
	read: vi.fn((address: number) => memory[address] ?? 0),
	write: vi.fn((address: number, value: number) => {
		memory[address] = value & 0xff;
	}),
	reset: vi.fn(),
	tick: vi.fn(),
	load: vi.fn((address: number, data: Uint8Array) => {
		memory.set(data, address);
	}),
	registerTickHandler: vi.fn(),
	unregisterTickHandler: vi.fn(),
	search: vi.fn(() => []),
	ioWrite: vi.fn(),
	getBank: vi.fn(() => 0),
	getMachineStateSpecs: vi.fn(() => []),
});

/**
 * CPU test context containing all necessary components
 */
export interface CpuTestContext {
	bus: IBus;
	memory: Uint8Array;
	registers: ArrayBuffer;
	registersView: DataView;
	stackMeta: Uint8Array;
}

/**
 * Initializes the CPU and returns a complete test context.
 * This is the recommended way to set up CPU tests.
 */
export const setupCpuTest = (): CpuTestContext => {
	// Mock self for worker environment
	vi.stubGlobal("self", { postMessage: vi.fn() });

	const memory = new Uint8Array(TEST_MEMORY_SIZE);
	const registers = new ArrayBuffer(TEST_REGISTERS_SIZE);
	const registersView = new DataView(registers);
	const stackMeta = new Uint8Array(TEST_STACK_META_SIZE);
	const bus = createMockBus(memory);

	// Initialize CPU with all required parameters
	initCPU(bus, registersView, null, memory, stackMeta);

	// Ensure CPU is in a state to execute
	setRunning(false);

	return { bus, memory, registers, registersView, stackMeta };
};

/**
 * Re-exports commonly used flag masks for convenience
 */
export {
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

// Export stepInstruction that was imported from cpu.65c02
export { stepInstruction };
