import { beforeEach, describe, expect, it } from "vitest";
import {
	executeInstruction,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
	setupCpuTest,
} from "./cpu-test-helpers";
import type { CpuTestContext } from "./cpu-test-helpers";

// The address bus is 16 bits: an indexed address past $FFFF wraps to $00xx.
describe("CPU 65C02 - indexed addresses wrap at $FFFF", () => {
	let ctx: CpuTestContext;

	const load = (bytes: number[]) => {
		ctx.memory.set(bytes, 0x0200);
		ctx.registersView.setUint16(REG_PC_OFFSET, 0x0200, true);
	};

	beforeEach(() => {
		ctx = setupCpuTest();
	});

	it("LDA abs,X reads $0010 for $FFF0,X with X=$20, with the page-cross cycle", () => {
		ctx.memory[0x0010] = 0x42;
		ctx.registersView.setUint8(REG_X_OFFSET, 0x20);
		load([0xbd, 0xf0, 0xff]); // LDA $FFF0,X

		expect(executeInstruction()).toBe(5);
		expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0x42);
	});

	it("LDA abs,Y reads $0010 for $FFF0,Y with Y=$20", () => {
		ctx.memory[0x0010] = 0x42;
		ctx.registersView.setUint8(REG_Y_OFFSET, 0x20);
		load([0xb9, 0xf0, 0xff]); // LDA $FFF0,Y

		executeInstruction();
		expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0x42);
	});

	it("STA abs,X writes $0010 for $FFF0,X with X=$20", () => {
		ctx.registersView.setUint8(REG_A_OFFSET, 0x42);
		ctx.registersView.setUint8(REG_X_OFFSET, 0x20);
		load([0x9d, 0xf0, 0xff]); // STA $FFF0,X

		executeInstruction();
		expect(ctx.memory[0x0010]).toBe(0x42);
	});

	it("INC abs,X increments $0010 for $FFF0,X with X=$20", () => {
		ctx.memory[0x0010] = 0x41;
		ctx.registersView.setUint8(REG_X_OFFSET, 0x20);
		load([0xfe, 0xf0, 0xff]); // INC $FFF0,X

		executeInstruction();
		expect(ctx.memory[0x0010]).toBe(0x42);
	});

	it("LDA (zp),Y reads $0010 for a pointer to $FFF0 with Y=$20", () => {
		ctx.memory[0x0080] = 0xf0;
		ctx.memory[0x0081] = 0xff;
		ctx.memory[0x0010] = 0x42;
		ctx.registersView.setUint8(REG_Y_OFFSET, 0x20);
		load([0xb1, 0x80]); // LDA ($80),Y

		executeInstruction();
		expect(ctx.registersView.getUint8(REG_A_OFFSET)).toBe(0x42);
	});

	it("JMP (abs,X) reads its vector at $0010 for ($FFF0,X) with X=$20", () => {
		ctx.memory[0x0010] = 0x34;
		ctx.memory[0x0011] = 0x12;
		ctx.registersView.setUint8(REG_X_OFFSET, 0x20);
		load([0x7c, 0xf0, 0xff]); // JMP ($FFF0,X)

		executeInstruction();
		expect(ctx.registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x1234);
	});

	it("JMP (abs) takes the vector's high byte from $0000 for ($FFFF)", () => {
		ctx.memory[0xffff] = 0x34;
		ctx.memory[0x0000] = 0x12;
		load([0x6c, 0xff, 0xff]); // JMP ($FFFF)

		executeInstruction();
		expect(ctx.registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x1234);
	});
});
