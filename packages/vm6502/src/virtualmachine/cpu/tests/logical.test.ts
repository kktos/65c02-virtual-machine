// c:\devwork\65c02-virtual-machine\packages\vm6502\src\cpu\tests\logical.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBus } from "../bus.interface";
import { initCPU, stepInstruction } from "../cpu.65c02";
import { setRunning } from "../cpu.6502";
import { FLAG_N_MASK, FLAG_Z_MASK, REG_A_OFFSET, REG_PC_OFFSET, REG_STATUS_OFFSET } from "../shared-memory";

describe("CPU 65C02 - Logical Instructions (AND, ORA, EOR)", () => {
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

	const executeLogical = (opcode: number, initialA: number, operand: number, initialFlags: number) => {
		const pc = 0x0000;
		registersView.setUint16(REG_PC_OFFSET, pc, true);
		registersView.setUint8(REG_A_OFFSET, initialA);
		registersView.setUint8(REG_STATUS_OFFSET, initialFlags);

		// Write Opcode and Operand to memory
		memory[pc] = opcode;
		memory[pc + 1] = operand;

		stepInstruction();

		return {
			a: registersView.getUint8(REG_A_OFFSET),
			status: registersView.getUint8(REG_STATUS_OFFSET),
		};
	};

	describe("AND Instruction (Immediate - 0x29)", () => {
		const OPCODE_AND_IMM = 0x29;

		it("should perform bitwise AND correctly", () => {
			// 0xFF & 0x0F = 0x0F
			const { a, status } = executeLogical(OPCODE_AND_IMM, 0xff, 0x0f, 0);
			expect(a).toBe(0x0f);
			expect(status & FLAG_Z_MASK).toBe(0);
			expect(status & FLAG_N_MASK).toBe(0);
		});

		it("should set Zero flag when result is zero", () => {
			// 0x55 & 0xAA = 0x00
			const { a, status } = executeLogical(OPCODE_AND_IMM, 0x55, 0xaa, 0);
			expect(a).toBe(0x00);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
			expect(status & FLAG_N_MASK).toBe(0);
		});

		it("should set Negative flag when bit 7 is set", () => {
			// 0xFF & 0x80 = 0x80
			const { a, status } = executeLogical(OPCODE_AND_IMM, 0xff, 0x80, 0);
			expect(a).toBe(0x80);
			expect(status & FLAG_N_MASK).toBe(FLAG_N_MASK);
			expect(status & FLAG_Z_MASK).toBe(0);
		});
	});

	describe("ORA Instruction (Immediate - 0x09)", () => {
		const OPCODE_ORA_IMM = 0x09;

		it("should perform bitwise OR correctly", () => {
			// 0xF0 | 0x0F = 0xFF
			const { a, status } = executeLogical(OPCODE_ORA_IMM, 0xf0, 0x0f, 0);
			expect(a).toBe(0xff);
			expect(status & FLAG_Z_MASK).toBe(0);
			expect(status & FLAG_N_MASK).toBe(FLAG_N_MASK);
		});

		it("should set Zero flag when result is zero", () => {
			// 0x00 | 0x00 = 0x00
			const { a, status } = executeLogical(OPCODE_ORA_IMM, 0x00, 0x00, 0);
			expect(a).toBe(0x00);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
			expect(status & FLAG_N_MASK).toBe(0);
		});
	});

	describe("EOR Instruction (Immediate - 0x49)", () => {
		const OPCODE_EOR_IMM = 0x49;

		it("should perform bitwise XOR correctly", () => {
			// 0xFF ^ 0x0F = 0xF0
			const { a, status } = executeLogical(OPCODE_EOR_IMM, 0xff, 0x0f, 0);
			expect(a).toBe(0xf0);
			expect(status & FLAG_Z_MASK).toBe(0);
			expect(status & FLAG_N_MASK).toBe(FLAG_N_MASK);
		});

		it("should set Zero flag when result is zero", () => {
			// 0xFF ^ 0xFF = 0x00
			const { a, status } = executeLogical(OPCODE_EOR_IMM, 0xff, 0xff, 0);
			expect(a).toBe(0x00);
			expect(status & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
			expect(status & FLAG_N_MASK).toBe(0);
		});
	});
});
