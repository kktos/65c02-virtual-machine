import { beforeEach, describe, expect, it } from "vitest";
import { executeInstruction, REG_PC_OFFSET, setupCpuTest } from "./cpu-test-helpers";
import type { CpuTestContext } from "./cpu-test-helpers";

describe("CPU 65C02 - 3-byte undefined NOPs", () => {
	let ctx: CpuTestContext;

	beforeEach(() => {
		ctx = setupCpuTest();
	});

	it.each([
		[0x5c, 8],
		[0xdc, 4],
		[0xfc, 4],
	])("opcode $%s skips 2 operand bytes and takes %i cycles", (opcode, expectedCycles) => {
		ctx.memory[0x0200] = opcode;
		ctx.memory[0x0201] = 0x34;
		ctx.memory[0x0202] = 0x12;
		ctx.registersView.setUint16(REG_PC_OFFSET, 0x0200, true);

		expect(executeInstruction()).toBe(expectedCycles);
		expect(ctx.registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0203);
	});
});
