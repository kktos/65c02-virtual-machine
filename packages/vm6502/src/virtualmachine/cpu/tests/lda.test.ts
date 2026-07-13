import { beforeEach, describe, expect, it } from "vitest";
import {
	setupCpuTest,
	stepInstruction,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
	FLAG_N_MASK,
	FLAG_Z_MASK,
} from "./cpu-test-helpers";
import type { CpuTestContext } from "./cpu-test-helpers";

describe("CPU 65C02 - LDA Instruction", () => {
	let ctx: CpuTestContext;

	beforeEach(() => {
		ctx = setupCpuTest();
	});

	describe("Immediate Addressing (0xA9)", () => {
		it("should load immediate value into A", () => {
			ctx.registersView.setUint8(REG_A_OFFSET, 0x00);
			ctx.registersView.setUint8(REG_STATUS_OFFSET, FLAG_Z_MASK);

			// LDA #$42
			ctx.memory[0x0000] = 0xa9;
			ctx.memory[0x0001] = 0x42;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0x42);
			expect(ctx.registersView.getUint8(REG_STATUS_OFFSET) & FLAG_Z_MASK).toBe(0);
			expect(ctx.registersView.getUint8(REG_STATUS_OFFSET) & FLAG_N_MASK).toBe(0);
		});

		it("should set Zero flag when loading 0x00", () => {
			ctx.registersView.setUint8(REG_A_OFFSET, 0x42);
			ctx.registersView.setUint8(REG_STATUS_OFFSET, 0);

			// LDA #$00
			ctx.memory[0x0000] = 0xa9;
			ctx.memory[0x0001] = 0x00;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0x00);
			expect(ctx.registersView.getUint8(REG_STATUS_OFFSET) & FLAG_Z_MASK).toBe(FLAG_Z_MASK);
			expect(ctx.registersView.getUint8(REG_STATUS_OFFSET) & FLAG_N_MASK).toBe(0);
		});

		it("should set Negative flag when loading 0x80", () => {
			ctx.registersView.setUint8(REG_A_OFFSET, 0x42);
			ctx.registersView.setUint8(REG_STATUS_OFFSET, 0);

			// LDA #$80
			ctx.memory[0x0000] = 0xa9;
			ctx.memory[0x0001] = 0x80;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0x80);
			expect(ctx.registersView.getUint8(REG_STATUS_OFFSET) & FLAG_Z_MASK).toBe(0);
			expect(ctx.registersView.getUint8(REG_STATUS_OFFSET) & FLAG_N_MASK).toBe(FLAG_N_MASK);
		});
	});

	describe("Zero Page Addressing (0xA5)", () => {
		it("should load value from zero page address", () => {
			// LDA $10
			ctx.memory[0x0000] = 0xa5;
			ctx.memory[0x0001] = 0x10;
			ctx.memory[0x0010] = 0xab;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xab);
		});
	});

	describe("Zero Page, X Addressing (0xB5)", () => {
		it("should load value from zero page address indexed with X", () => {
			ctx.registersView.setUint8(REG_X_OFFSET, 0x05);

			// LDA $10,X (effective address: $0010 + $05 = $0015)
			ctx.memory[0x0000] = 0xb5;
			ctx.memory[0x0001] = 0x10;
			ctx.memory[0x0015] = 0xcd;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xcd);
		});
	});

	describe("Absolute Addressing (0xAD)", () => {
		it("should load value from absolute address", () => {
			// LDA $1234
			ctx.memory[0x0000] = 0xad;
			ctx.memory[0x0001] = 0x34;
			ctx.memory[0x0002] = 0x12;
			ctx.memory[0x1234] = 0xef;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xef);
		});
	});

	describe("Absolute, X Addressing (0xBD)", () => {
		it("should load value from absolute address indexed with X (no page cross)", () => {
			ctx.registersView.setUint8(REG_X_OFFSET, 0x10);

			// LDA $1234,X (effective address: $1234 + $10 = $1244)
			ctx.memory[0x0000] = 0xbd;
			ctx.memory[0x0001] = 0x34;
			ctx.memory[0x0002] = 0x12;
			ctx.memory[0x1244] = 0xfa;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xfa);
		});

		it("should load value from absolute address indexed with X (with page cross)", () => {
			ctx.registersView.setUint8(REG_X_OFFSET, 0x01);

			// LDA $12FF,X (effective address: $12FF + $01 = $1300)
			ctx.memory[0x0000] = 0xbd;
			ctx.memory[0x0001] = 0xff;
			ctx.memory[0x0002] = 0x12;
			ctx.memory[0x1300] = 0xfb;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xfb);
		});
	});

	describe("Absolute, Y Addressing (0xB9)", () => {
		it("should load value from absolute address indexed with Y (no page cross)", () => {
			ctx.registersView.setUint8(REG_Y_OFFSET, 0x10);

			// LDA $1234,Y (effective address: $1234 + $10 = $1244)
			ctx.memory[0x0000] = 0xb9;
			ctx.memory[0x0001] = 0x34;
			ctx.memory[0x0002] = 0x12;
			ctx.memory[0x1244] = 0xfc;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xfc);
		});

		it("should load value from absolute address indexed with Y (with page cross)", () => {
			ctx.registersView.setUint8(REG_Y_OFFSET, 0x01);

			// LDA $12FF,Y (effective address: $12FF + $01 = $1300)
			ctx.memory[0x0000] = 0xb9;
			ctx.memory[0x0001] = 0xff;
			ctx.memory[0x0002] = 0x12;
			ctx.memory[0x1300] = 0xfd;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xfd);
		});
	});

	describe("(Indirect, X) Addressing (0xA1)", () => {
		it("should load value from indirect address indexed with X", () => {
			ctx.registersView.setUint8(REG_X_OFFSET, 0x04);

			// LDA ($10,X) - pointer at $0014 -> $4050
			ctx.memory[0x0000] = 0xa1;
			ctx.memory[0x0001] = 0x10;
			// Pointer at $0014
			ctx.memory[0x0014] = 0x50;
			ctx.memory[0x0015] = 0x40;
			// Value at $4050
			ctx.memory[0x4050] = 0xde;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xde);
		});
	});

	describe("(Indirect), Y Addressing (0xB1)", () => {
		it("should load value from indirect address indexed with Y (no page cross)", () => {
			ctx.registersView.setUint8(REG_Y_OFFSET, 0x10);

			// LDA ($20),Y - pointer at $0020 -> $5040, effective: $5040 + $10 = $5050
			ctx.memory[0x0000] = 0xb1;
			ctx.memory[0x0001] = 0x20;
			// Pointer at $0020
			ctx.memory[0x0020] = 0x40;
			ctx.memory[0x0021] = 0x50;
			// Value at $5050
			ctx.memory[0x5050] = 0xbe;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xbe);
		});

		it("should load value from indirect address indexed with Y (with page cross)", () => {
			ctx.registersView.setUint8(REG_Y_OFFSET, 0x10);

			// LDA ($20),Y - pointer at $0020 -> $50F0, effective: $50F0 + $10 = $5100
			ctx.memory[0x0000] = 0xb1;
			ctx.memory[0x0001] = 0x20;
			// Pointer at $0020
			ctx.memory[0x0020] = 0xf0;
			ctx.memory[0x0021] = 0x50;
			// Value at $5100
			ctx.memory[0x5100] = 0xbf;
			ctx.registersView.setUint16(REG_PC_OFFSET, 0x0000, true);

			stepInstruction();

			expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0xbf);
		});
	});
});
