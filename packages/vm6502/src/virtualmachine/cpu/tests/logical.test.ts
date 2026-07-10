import { beforeEach, describe, expect, it } from "vitest";
import { setupCpuTest, stepInstruction, REG_A_OFFSET, REG_PC_OFFSET, REG_STATUS_OFFSET, FLAG_N_MASK, FLAG_Z_MASK } from "./cpu-test-helpers";
import type { CpuTestContext } from "./cpu-test-helpers";

describe("CPU 65C02 - Logical Instructions (AND, ORA, EOR)", () => {
	let ctx: CpuTestContext;

	beforeEach(() => {
		ctx = setupCpuTest();
	});

	const executeLogical = (opcode: number, initialA: number, operand: number, initialFlags: number) => {
		const pc = 0x0000;
		ctx.registersView.setUint16(REG_PC_OFFSET, pc, true);
		ctx.registersView.setUint8(REG_A_OFFSET, initialA);
		ctx.registersView.setUint8(REG_STATUS_OFFSET, initialFlags);

		// Write Opcode and Operand to memory
		ctx.memory[pc] = opcode;
		ctx.memory[pc + 1] = operand;

		stepInstruction();

		return {
			a: ctx.registersView.getUint8(REG_A_OFFSET),
			status: ctx.registersView.getUint8(REG_STATUS_OFFSET),
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
