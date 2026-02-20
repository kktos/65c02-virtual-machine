// c:\devwork\65c02-virtual-machine\packages\vm6502\src\cpu\tests\sbc.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBus } from "../bus.interface";
import { initCPU, stepInstruction } from "../cpu.65c02";
import { setRunning } from "../cpu.6502";
import { FLAG_C_MASK, FLAG_D_MASK, FLAG_N_MASK, FLAG_V_MASK, FLAG_Z_MASK, REG_A_OFFSET, REG_PC_OFFSET, REG_STATUS_OFFSET } from "../shared-memory";

describe("CPU 65C02 - SBC Instruction", () => {
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
		registers = new ArrayBuffer(64);
		registersView = new DataView(registers);

		// Mock self for worker environment
		vi.stubGlobal("self", { postMessage: vi.fn() });

		// Initialize CPU
		initCPU(bus, registersView);

		// Ensure CPU is in a state to execute
		setRunning(false);
	});

	const executeSBC = (initialA: number, operand: number, initialFlags: number) => {
		const pc = 0x0000;
		registersView.setUint16(REG_PC_OFFSET, pc, true);

		registersView.setUint8(REG_A_OFFSET, initialA);
		registersView.setUint8(REG_STATUS_OFFSET, initialFlags);

		// SBC Immediate (0xE9)
		memory[pc] = 0xe9;
		memory[pc + 1] = operand;

		stepInstruction();

		return {
			a: registersView.getUint8(REG_A_OFFSET),
			status: registersView.getUint8(REG_STATUS_OFFSET),
		};
	};

	describe("Binary Mode (D Flag Clear)", () => {
		it("should subtract two numbers correctly without borrow (Carry Set)", () => {
			// 5 - 3 = 2
			const { a, status } = executeSBC(0x05, 0x03, FLAG_C_MASK);

			expect(a).toBe(0x02);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK); // No borrow generated (result >= 0)
			expect(status & FLAG_Z_MASK).toBe(0);
			expect(status & FLAG_N_MASK).toBe(0);
		});

		it("should subtract with borrow (Carry Clear)", () => {
			// 5 - 3 - 1 = 1
			const { a, status } = executeSBC(0x05, 0x03, 0);

			expect(a).toBe(0x01);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK); // No borrow generated
		});

		it("should handle subtraction resulting in negative value (Borrow generated)", () => {
			// 3 - 5 = -2 (0xFE)
			const { a, status } = executeSBC(0x03, 0x05, FLAG_C_MASK);

			expect(a).toBe(0xfe);
			expect(status & FLAG_C_MASK).toBe(0); // Borrow generated (Carry Clear)
			expect(status & FLAG_N_MASK).toBe(FLAG_N_MASK);
		});

		it("should set Zero flag when result is zero", () => {
			// 5 - 5 = 0
			const { a, status } = executeSBC(0x05, 0x05, FLAG_C_MASK);

			expect(a).toBe(0x00);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK);
		});

		it("should set Overflow (V) flag: Positive - Negative = Negative", () => {
			// 127 (0x7F) - (-1 (0xFF)) = 128 (0x80) -> Overflow
			const { a, status } = executeSBC(0x7f, 0xff, FLAG_C_MASK);

			expect(a).toBe(0x80);
			expect(status & FLAG_V_MASK).toBe(FLAG_V_MASK);
			expect(status & FLAG_N_MASK).toBe(FLAG_N_MASK);
		});

		it("should set Overflow (V) flag: Negative - Positive = Positive", () => {
			// -128 (0x80) - 1 (0x01) = -129 -> +127 (0x7F) -> Overflow
			const { a, status } = executeSBC(0x80, 0x01, FLAG_C_MASK);

			expect(a).toBe(0x7f);
			expect(status & FLAG_V_MASK).toBe(FLAG_V_MASK);
			expect(status & FLAG_N_MASK).toBe(0);
		});
	});

	describe("Decimal Mode (D Flag Set)", () => {
		it("should perform basic BCD subtraction", () => {
			// 15 - 05 = 10 (0x10)
			const { a, status } = executeSBC(0x15, 0x05, FLAG_D_MASK | FLAG_C_MASK);

			expect(a).toBe(0x10);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK);
		});

		it("should perform BCD subtraction with borrow", () => {
			// 15 - 05 - 1 = 09 (0x09)
			const { a, status } = executeSBC(0x15, 0x05, FLAG_D_MASK);

			expect(a).toBe(0x09);
			expect(status & FLAG_C_MASK).toBe(FLAG_C_MASK);
		});

		it("should handle BCD wrap around (Borrow generated)", () => {
			// 05 - 06 = 99 (0x99)
			const { a, status } = executeSBC(0x05, 0x06, FLAG_D_MASK | FLAG_C_MASK);

			expect(a).toBe(0x99);
			expect(status & FLAG_C_MASK).toBe(0); // Borrow generated
		});

		it("should set Zero flag correctly in Decimal mode", () => {
			// 05 - 05 = 00
			const { a, status } = executeSBC(0x05, 0x05, FLAG_D_MASK | FLAG_C_MASK);

			expect(a).toBe(0x00);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
		});

		it("should set Negative flag correctly in Decimal mode", () => {
			// 05 - 06 = 99 (0x99) -> Bit 7 set
			const { a, status } = executeSBC(0x05, 0x06, FLAG_D_MASK | FLAG_C_MASK);

			expect(a).toBe(0x99);
			expect(status & FLAG_N_MASK).toBe(FLAG_N_MASK);
		});
	});
});
