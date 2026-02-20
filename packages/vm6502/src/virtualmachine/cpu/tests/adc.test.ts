// c:\devwork\65c02-virtual-machine\packages\vm6502\src\cpu\cpu.65c02.adc.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBus } from "../bus.interface";
import { initCPU, stepInstruction } from "../cpu.65c02";
import { setRunning } from "../cpu.6502";
import { FLAG_C_MASK, FLAG_D_MASK, FLAG_N_MASK, FLAG_V_MASK, FLAG_Z_MASK, REG_A_OFFSET, REG_PC_OFFSET, REG_STATUS_OFFSET } from "../shared-memory";

describe("CPU 65C02 - ADC Instruction", () => {
	let bus: IBus;
	let memory: Uint8Array;
	let registers: ArrayBuffer;
	let registersView: DataView;

	beforeEach(() => {
		memory = new Uint8Array(0x3ff);

		// Mock Bus
		bus = {
			read: vi.fn((address: number) => memory[address] ?? 0),
			write: vi.fn((address: number, value: number) => {
				memory[address] = value;
			}),
		};

		// Initialize Registers
		registers = new ArrayBuffer(64); // Sufficient size for registers
		registersView = new DataView(registers);

		// Mock self for worker environment
		vi.stubGlobal("self", { postMessage: vi.fn() });

		// Initialize CPU
		initCPU(bus, registersView);

		// Ensure CPU is in a state to execute
		setRunning(false);
	});

	const executeADC = (initialA: number, operand: number, initialFlags: number) => {
		// Setup PC to 0x0000 for simplicity
		const pc = 0x0000;
		registersView.setUint16(REG_PC_OFFSET, pc, true);

		// Setup Registers
		registersView.setUint8(REG_A_OFFSET, initialA);
		registersView.setUint8(REG_STATUS_OFFSET, initialFlags);

		// Write Opcode (ADC Immediate - 0x69) and Operand to memory
		memory[pc] = 0x69;
		memory[pc + 1] = operand;

		// Execute one instruction
		stepInstruction();

		// Return result
		return {
			a: registersView.getUint8(REG_A_OFFSET),
			status: registersView.getUint8(REG_STATUS_OFFSET),
		};
	};

	describe("Binary Mode (D Flag Clear)", () => {
		it("should add two numbers correctly without carry", () => {
			const { a, status } = executeADC(0x10, 0x20, 0);

			expect(a).toBe(0x30);
			expect(status & FLAG_C_MASK).toBe(0);
			expect(status & FLAG_Z_MASK).toBe(0);
			expect(status & FLAG_N_MASK).toBe(0);
			expect(status & FLAG_V_MASK).toBe(0);
		});

		it("should add with carry input set", () => {
			const { a, status } = executeADC(0x10, 0x20, FLAG_C_MASK);

			expect(a).toBe(0x31); // 0x10 + 0x20 + 1
			expect(status & FLAG_C_MASK).toBe(0);
		});

		it("should set Carry flag on overflow", () => {
			const { a, status } = executeADC(0xff, 0x01, 0);

			expect(a).toBe(0x00);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK); // Result is 0
		});

		it("should set Zero flag when result is zero", () => {
			const { a, status } = executeADC(0x00, 0x00, 0);

			expect(a).toBe(0x00);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
		});

		it("should set Negative flag when result has bit 7 set", () => {
			const { a, status } = executeADC(0x00, 0x80, 0);

			expect(a).toBe(0x80);
			expect(status & FLAG_N_MASK).toBe(FLAG_N_MASK);
		});

		it("should set Overflow (V) flag: Positive + Positive = Negative", () => {
			// 0x7F (127) + 0x01 (1) = 0x80 (-128)
			const { a, status } = executeADC(0x7f, 0x01, 0);

			expect(a).toBe(0x80);
			expect(status & FLAG_V_MASK).toBe(FLAG_V_MASK);
			expect(status & FLAG_N_MASK).toBe(FLAG_N_MASK);
		});

		it("should set Overflow (V) flag: Negative + Negative = Positive", () => {
			// 0x80 (-128) + 0x80 (-128) = 0x00 (0) with Carry
			const { a, status } = executeADC(0x80, 0x80, 0);

			expect(a).toBe(0x00);
			expect(status & FLAG_V_MASK).toBe(FLAG_V_MASK);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
		});

		it("should NOT set Overflow (V) flag: Positive + Negative", () => {
			// 0x01 (1) + 0xFF (-1) = 0x00 (0) with Carry
			const { a, status } = executeADC(0x01, 0xff, 0);

			expect(a).toBe(0x00);
			expect(status & FLAG_V_MASK).toBe(0);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK);
		});
	});

	describe("Decimal Mode (D Flag Set)", () => {
		it("should perform basic BCD addition", () => {
			// 05 + 05 = 10 (0x10)
			const { a, status } = executeADC(0x05, 0x05, FLAG_D_MASK);

			expect(a).toBe(0x10);
			expect(status & FLAG_C_MASK).toBe(0);
		});

		it("should handle lower nibble carry (half-carry)", () => {
			// 09 + 01 = 10 (0x10)
			const { a } = executeADC(0x09, 0x01, FLAG_D_MASK);

			expect(a).toBe(0x10);
		});

		it("should handle upper nibble carry (Carry flag)", () => {
			// 90 + 10 = 100 (0x00 with Carry)
			const { a, status } = executeADC(0x90, 0x10, FLAG_D_MASK);

			expect(a).toBe(0x00);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
		});

		it("should handle mixed carries", () => {
			// 19 + 01 = 20 (0x20)
			const { a } = executeADC(0x19, 0x01, FLAG_D_MASK);

			expect(a).toBe(0x20);
		});

		it("should include incoming Carry flag in BCD addition", () => {
			// 09 + 00 + C = 10 (0x10)
			const { a } = executeADC(0x09, 0x00, FLAG_D_MASK | FLAG_C_MASK);

			expect(a).toBe(0x10);
		});

		it("should set Zero flag correctly in Decimal mode", () => {
			// 00 + 00 = 00
			const { a, status } = executeADC(0x00, 0x00, FLAG_D_MASK);

			expect(a).toBe(0x00);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
		});

		it("should set Negative flag correctly in Decimal mode", () => {
			// 40 + 40 = 80 (0x80) -> Negative bit set
			const { a, status } = executeADC(0x40, 0x40, FLAG_D_MASK);

			expect(a).toBe(0x80);
			expect(status & FLAG_N_MASK).toBe(FLAG_N_MASK);
		});

		it("should handle complex BCD correction (Example: 49 + 49)", () => {
			// 49 + 49 = 98 (0x98)
			// Binary: 0x49 + 0x49 = 0x92.
			// Low nibble: 9+9=18 (>9), +6 = 24 (0x18). Low nibble is 8. Carry to high.
			// High nibble: 4+4=8. +1 (carry) = 9.
			// Result 0x98.
			const { a } = executeADC(0x49, 0x49, FLAG_D_MASK);
			expect(a).toBe(0x98);
		});

		it("should handle complex BCD correction with overflow (Example: 99 + 01)", () => {
			// 99 + 01 = 100 (0x00, Carry)
			const { a, status } = executeADC(0x99, 0x01, FLAG_D_MASK);
			expect(a).toBe(0x00);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK);
		});
	});
});
