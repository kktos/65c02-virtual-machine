import { beforeEach, describe, expect, it } from "vitest";
import { setIrqLine, triggerNmi } from "../cpu.65c02";
import {
	type CpuTestContext,
	FLAG_B_MASK,
	FLAG_D_MASK,
	FLAG_I_MASK,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	setupCpuTest,
	stepInstruction,
} from "./cpu-test-helpers";

describe("CPU 65C02 - IRQ / NMI", () => {
	let ctx: CpuTestContext;
	const pc = () => ctx.registersView.getUint16(REG_PC_OFFSET, true);
	const sp = () => ctx.registersView.getUint8(REG_SP_OFFSET);
	const status = () => ctx.registersView.getUint8(REG_STATUS_OFFSET);

	beforeEach(() => {
		ctx = setupCpuTest();
		setIrqLine(false);
		ctx.memory.set([0x00, 0x90], 0xfffe); // IRQ → $9000
		ctx.memory.set([0x00, 0xa0], 0xfffa); // NMI → $A000
		ctx.memory.fill(0xea, 0x0300, 0x0310); // NOPs
		ctx.memory[0x9000] = 0x40; // RTI
		ctx.registersView.setUint16(REG_PC_OFFSET, 0x0300, true);
		ctx.registersView.setUint8(REG_SP_OFFSET, 0xff);
		ctx.registersView.setUint8(REG_STATUS_OFFSET, FLAG_D_MASK); // I clear, D set
	});

	it("takes the IRQ at the end of the instruction: PC and P (B clear) pushed, I set, D cleared", () => {
		setIrqLine(true);
		stepInstruction(); // the NOP at $300, then the interrupt
		expect(pc()).toBe(0x9000);
		expect(sp()).toBe(0xfc);
		expect(ctx.memory[0x1ff]).toBe(0x03);
		expect(ctx.memory[0x1fe]).toBe(0x01); // returns to $301
		expect(ctx.memory[0x1fd]! & FLAG_B_MASK).toBe(0);
		expect(ctx.memory[0x1fd]! & FLAG_D_MASK).toBe(FLAG_D_MASK);
		expect(status() & FLAG_I_MASK).toBe(FLAG_I_MASK);
		expect(status() & FLAG_D_MASK).toBe(0);
	});

	it("holds the IRQ off while I is set, takes it after CLI", () => {
		ctx.registersView.setUint8(REG_STATUS_OFFSET, FLAG_I_MASK);
		ctx.memory[0x0301] = 0x58; // CLI
		setIrqLine(true);
		stepInstruction();
		expect(pc()).toBe(0x0301);
		stepInstruction(); // CLI
		expect(pc()).toBe(0x9000);
	});

	it("RTI returns, and the level IRQ still asserted is taken again", () => {
		setIrqLine(true);
		stepInstruction();
		stepInstruction(); // RTI: I clear again, the line still up
		expect(pc()).toBe(0x9000);
		setIrqLine(false); // acknowledged by the handler
		stepInstruction();
		expect(pc()).toBe(0x0301);
		expect(sp()).toBe(0xff);
	});

	it("takes an NMI whatever I, once per edge", () => {
		ctx.registersView.setUint8(REG_STATUS_OFFSET, FLAG_I_MASK);
		ctx.memory[0xa000] = 0xea;
		triggerNmi();
		stepInstruction();
		expect(pc()).toBe(0xa000);
		stepInstruction();
		expect(pc()).toBe(0xa001);
	});
});
