import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearTrace, getTrace, getTraceTotal, setTrace, setTraceSize } from "../cpu.65c02";
import { REG_PC_OFFSET, setupCpuTest, stepInstruction } from "./cpu-test-helpers";

describe("CPU 65C02 - jumps trace", () => {
	beforeEach(() => {
		const ctx = setupCpuTest();
		ctx.memory.set([0x4c, 0x00, 0x03], 0x0300); // JMP $0300: the same entry each time
		ctx.registersView.setUint16(REG_PC_OFFSET, 0x0300, true);
		setTrace(true);
		setTraceSize(4);
		clearTrace();
	});

	afterEach(() => {
		setTrace(false);
		setTraceSize(200);
		clearTrace();
	});

	it("counts every entry logged, those the buffer dropped included", () => {
		for (let i = 0; i < 10; i++) stepInstruction();
		expect(getTrace()).toHaveLength(4);
		expect(getTraceTotal()).toBe(10);
	});

	it("restarts the count on a clear", () => {
		for (let i = 0; i < 3; i++) stepInstruction();
		clearTrace();
		expect(getTraceTotal()).toBe(0);
		stepInstruction();
		expect(getTraceTotal()).toBe(1);
	});
});
