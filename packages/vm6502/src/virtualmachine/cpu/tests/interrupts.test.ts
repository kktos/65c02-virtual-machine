import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMU, IMU_CTRL_ENABLE, IMU_REG_CTRL, IMU_REG_HANDLER, IMU_REG_HBANK } from "@/machines/chips/imu";
import { clearTrace, getTrace, setIrqLine, setTrace, triggerNmi } from "../cpu.65c02";
import {
	type CpuTestContext,
	executeInstruction,
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

describe("CPU 65C02 - vectored IRQ (IMU)", () => {
	let ctx: CpuTestContext;
	let imu: IMU;
	let calls: string[];
	const pc = () => ctx.registersView.getUint16(REG_PC_OFFSET, true);
	const sp = () => ctx.registersView.getUint8(REG_SP_OFFSET);
	const status = () => ctx.registersView.getUint8(REG_STATUS_OFFSET);
	const setHandler = (id: number, address: number, bank = 0) => {
		imu.write(0, IMU_REG_HBANK + id);
		imu.write(1, bank);
		imu.write(0, IMU_REG_HANDLER + id);
		imu.write(1, address & 0xff);
		imu.write(2, address >> 8);
	};
	const enable = () => {
		imu.write(0, IMU_REG_CTRL);
		imu.write(1, IMU_CTRL_ENABLE);
	};

	beforeEach(() => {
		ctx = setupCpuTest();
		setIrqLine(false);
		calls = [];
		let depth = 0;
		imu = new IMU({
			irq: setIrqLine,
			context: {
				enter: (bank) => {
					// what the stack holds when the context switches: the pushes are done
					calls.push(`enter ${bank} sp=${sp().toString(16)}`);
					return depth++;
				},
				exit: (saved) => {
					depth--;
					// the pulls aren't done yet
					calls.push(`exit ${saved} sp=${sp().toString(16)}`);
				},
			},
		});
		ctx.bus.irqVector = vi.fn((s: number) => imu.irqVector(s));
		ctx.bus.onRti = vi.fn((s: number) => imu.onRti(s));
		ctx.memory.set([0x00, 0x90], 0xfffe); // IRQ → $9000
		ctx.memory.set([0x00, 0xa0], 0xfffa); // NMI → $A000
		ctx.memory.fill(0xea, 0x0300, 0x0310); // NOPs
		ctx.memory[0x9000] = 0x40; // RTI
		ctx.memory[0x4000] = 0x40; // RTI
		ctx.registersView.setUint16(REG_PC_OFFSET, 0x0300, true);
		ctx.registersView.setUint8(REG_SP_OFFSET, 0xff);
		ctx.registersView.setUint8(REG_STATUS_OFFSET, FLAG_D_MASK); // I clear, D set
	});

	it("jumps straight to the handler: 7 cycles, PC and P pushed, I set, D cleared", () => {
		enable();
		setHandler(4, 0x4000, 3);
		imu.setLine(4, true);
		expect(executeInstruction()).toBe(2 + 7); // the NOP, then the interrupt
		expect(pc()).toBe(0x4000);
		expect(sp()).toBe(0xfc);
		expect(ctx.memory[0x1ff]).toBe(0x03);
		expect(ctx.memory[0x1fe]).toBe(0x01);
		expect(ctx.memory[0x1fd]! & FLAG_B_MASK).toBe(0);
		expect(status() & FLAG_I_MASK).toBe(FLAG_I_MASK);
		expect(status() & FLAG_D_MASK).toBe(0);
		expect(ctx.bus.irqVector).toHaveBeenCalledWith(0xfc);
		expect(calls).toEqual(["enter 3 sp=fc"]);
	});

	it("RTI exits the context before the pulls, then returns", () => {
		enable();
		setHandler(4, 0x4000);
		imu.setLine(4, true);
		stepInstruction();
		imu.setLine(4, false);
		imu.write(3, 0); // EOI
		stepInstruction(); // RTI
		expect(calls).toEqual(["enter 0 sp=fc", "exit 0 sp=fc"]);
		expect(pc()).toBe(0x0301);
		expect(sp()).toBe(0xff);
	});

	it("falls back to $FFFE for an ID without a handler", () => {
		enable();
		imu.setLine(4, true);
		stepInstruction();
		expect(pc()).toBe(0x9000);
		expect(calls).toHaveLength(0);
	});

	it("falls back to $FFFE when vectoring is disabled", () => {
		setHandler(4, 0x4000);
		imu.setLine(4, true);
		stepInstruction();
		expect(pc()).toBe(0x9000);
	});

	it("never redirects a BRK", () => {
		enable();
		setHandler(4, 0x4000);
		ctx.registersView.setUint8(REG_STATUS_OFFSET, FLAG_I_MASK); // the line is up, but held off
		imu.setLine(4, true);
		ctx.memory[0x0300] = 0x00; // BRK
		stepInstruction();
		expect(pc()).toBe(0x9000);
		expect(ctx.bus.irqVector).not.toHaveBeenCalled();
	});

	it("never redirects an NMI", () => {
		enable();
		setHandler(4, 0x4000);
		ctx.registersView.setUint8(REG_STATUS_OFFSET, FLAG_I_MASK);
		imu.setLine(4, true);
		triggerNmi();
		stepInstruction();
		expect(pc()).toBe(0xa000);
		expect(ctx.bus.irqVector).not.toHaveBeenCalled();
	});

	it("a higher priority interrupts a handler that did CLI; both unwind in order", () => {
		enable();
		setHandler(4, 0x4000, 4);
		setHandler(1, 0x5000, 1);
		// $4000: CLI, NOP, RTI
		ctx.memory.set([0x58, 0xea, 0x40], 0x4000);
		ctx.memory[0x5000] = 0x40; // RTI
		imu.setLine(4, true);
		stepInstruction(); // NOP → IRQ#4
		expect(pc()).toBe(0x4000);
		imu.setLine(4, false); // acknowledged by the handler
		imu.setLine(1, true);
		stepInstruction(); // CLI → IRQ#1
		expect(pc()).toBe(0x5000);
		expect(sp()).toBe(0xf9);
		imu.setLine(1, false);
		imu.write(3, 0); // EOI of 1
		stepInstruction(); // RTI → back in the handler of 4
		expect(pc()).toBe(0x4001);
		imu.write(3, 0); // EOI of 4
		stepInstruction(); // NOP
		stepInstruction(); // RTI
		expect(pc()).toBe(0x0301);
		expect(calls).toEqual(["enter 4 sp=fc", "enter 1 sp=f9", "exit 1 sp=f9", "exit 0 sp=fc"]);
	});

	it("an RTI used as a jump passes through", () => {
		enable();
		setHandler(4, 0x4000);
		// $4000: push $0400 and P, RTI to $0400 (a jump, deeper than the IRQ's frame)
		ctx.memory.set([0xa9, 0x04, 0x48, 0xa9, 0x00, 0x48, 0x08, 0x40], 0x4000);
		ctx.memory[0x0400] = 0x40; // the handler's real RTI
		imu.setLine(4, true);
		stepInstruction();
		imu.setLine(4, false);
		for (let i = 0; i < 6; i++) stepInstruction(); // to the jumping RTI, included
		expect(pc()).toBe(0x0400);
		expect(calls).toEqual(["enter 0 sp=fc"]);
		stepInstruction(); // the real RTI
		expect(calls).toEqual(["enter 0 sp=fc", "exit 0 sp=fc"]);
		expect(pc()).toBe(0x0301);
	});

	it("traces a vectored IRQ as IRQ#n", () => {
		setTrace(true);
		clearTrace();
		enable();
		setHandler(4, 0x4000);
		imu.setLine(4, true);
		stepInstruction();
		expect(getTrace().map((entry) => entry.type)).toContain("IRQ#4");
		setTrace(false);
	});
});
