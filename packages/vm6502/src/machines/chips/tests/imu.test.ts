import { describe, expect, it, vi } from "vitest";
import {
	IMU,
	IMU_CTRL_AUTO_EOI,
	IMU_CTRL_ENABLE,
	IMU_NONE,
	IMU_PORT_CURRENT,
	IMU_PORT_DATAHI,
	IMU_PORT_DATALO,
	IMU_PORT_INDEX,
	IMU_REG_CTRL,
	IMU_REG_HANDLER,
	IMU_REG_HBANK,
	IMU_REG_INSERVICE,
	IMU_REG_MASK,
	IMU_REG_PENDING,
	IMU_REG_PRIO,
	type InterruptContext,
} from "../imu";

const setup = (context?: InterruptContext) => {
	const irq = vi.fn();
	const imu = new IMU({ irq, context });
	irq.mockClear();
	const set8 = (reg: number, value: number) => {
		imu.write(IMU_PORT_INDEX, reg);
		imu.write(IMU_PORT_DATALO, value);
	};
	const get = (reg: number) => {
		imu.write(IMU_PORT_INDEX, reg);
		return imu.read(IMU_PORT_DATALO) | (imu.read(IMU_PORT_DATAHI) << 8);
	};
	const setHandler = (id: number, address: number, bank = 0) => {
		set8(IMU_REG_HBANK + id, bank);
		set8(IMU_REG_HANDLER + id, address & 0xff);
		imu.write(IMU_PORT_DATAHI, address >> 8);
	};
	const enable = (ctrl = 0) => set8(IMU_REG_CTRL, IMU_CTRL_ENABLE | ctrl);
	const eoi = () => imu.write(IMU_PORT_CURRENT, 0);
	return { imu, irq, set8, get, setHandler, enable, eoi };
};

describe("IMU", () => {
	describe("reset state", () => {
		it("is disabled, unmasked, no handlers, PRIO n = n, nothing in service", () => {
			const { imu, get } = setup();
			expect(get(IMU_REG_CTRL)).toBe(0);
			expect(get(IMU_REG_MASK)).toBe(0);
			expect(get(IMU_REG_INSERVICE)).toBe(0);
			for (let id = 0; id < 8; id++) {
				expect(get(IMU_REG_PRIO + id)).toBe(id);
				expect(get(IMU_REG_HANDLER + id)).toBe(0);
				expect(get(IMU_REG_HBANK + id)).toBe(0);
			}
			expect(imu.read(IMU_PORT_CURRENT)).toBe(IMU_NONE);
		});

		it("reset() puts everything back", () => {
			const { imu, set8, setHandler, enable, get } = setup();
			enable();
			set8(IMU_REG_MASK, 0x0f);
			set8(IMU_REG_PRIO + 2, 7);
			setHandler(2, 0x1234, 5);
			imu.setLine(2, true);
			imu.write(IMU_PORT_INDEX, IMU_REG_PRIO);
			imu.reset();
			expect(imu.read(IMU_PORT_INDEX)).toBe(0);
			expect(get(IMU_REG_CTRL)).toBe(0);
			expect(get(IMU_REG_MASK)).toBe(0);
			expect(get(IMU_REG_PRIO + 2)).toBe(2);
			expect(get(IMU_REG_HANDLER + 2)).toBe(0);
			expect(get(IMU_REG_HBANK + 2)).toBe(0);
			expect(imu.getFrames()).toHaveLength(0);
		});
	});

	describe("disabled", () => {
		it("ORs its lines into the IRQ, whatever the mask", () => {
			const { imu, irq, set8 } = setup();
			set8(IMU_REG_MASK, 0xff);
			imu.setLine(4, true);
			expect(irq).toHaveBeenLastCalledWith(true);
			imu.setLine(7, true);
			imu.setLine(4, false);
			expect(irq).toHaveBeenCalledTimes(1);
			imu.setLine(7, false);
			expect(irq).toHaveBeenLastCalledWith(false);
		});

		it("never vectors, even with a handler", () => {
			const { imu, setHandler } = setup();
			setHandler(4, 0x1234);
			imu.setLine(4, true);
			expect(imu.irqVector(0xfc)).toBeUndefined();
		});
	});

	describe("registers", () => {
		it("PENDING shows the raw lines, mask ignored", () => {
			const { imu, set8, get, enable } = setup();
			enable();
			set8(IMU_REG_MASK, 0x10);
			imu.setLine(4, true);
			imu.setLine(1, true);
			expect(get(IMU_REG_PENDING)).toBe(0x12);
		});

		it("INDEX reads back", () => {
			const { imu } = setup();
			imu.write(IMU_PORT_INDEX, 0x13);
			expect(imu.read(IMU_PORT_INDEX)).toBe(0x13);
		});

		it("8-bit registers: DATA LO takes effect at once, DATA HI reads 0 and is ignored", () => {
			const { imu, set8, get } = setup();
			set8(IMU_REG_MASK, 0x5a);
			imu.write(IMU_PORT_DATAHI, 0xff);
			expect(get(IMU_REG_MASK)).toBe(0x5a);
			expect(imu.read(IMU_PORT_DATAHI)).toBe(0);
		});

		it("PRIO keeps 3 bits, CTRL its 2 defined bits", () => {
			const { set8, get } = setup();
			set8(IMU_REG_PRIO + 1, 0xfd);
			expect(get(IMU_REG_PRIO + 1)).toBe(5);
			set8(IMU_REG_CTRL, 0xff);
			expect(get(IMU_REG_CTRL)).toBe(0xc0);
		});

		it("PENDING and INSERVICE are read-only", () => {
			const { imu, set8, get } = setup();
			imu.setLine(2, true);
			set8(IMU_REG_PENDING, 0);
			set8(IMU_REG_INSERVICE, 0xff);
			expect(get(IMU_REG_PENDING)).toBe(0x04);
			expect(get(IMU_REG_INSERVICE)).toBe(0);
		});

		it("a handler is committed by DATA HI, with its staged bank; reads return the committed values", () => {
			const { imu, set8, get } = setup();
			set8(IMU_REG_HANDLER + 3, 0x34);
			expect(get(IMU_REG_HANDLER + 3)).toBe(0); // staged only
			set8(IMU_REG_HBANK + 3, 0x07);
			expect(get(IMU_REG_HBANK + 3)).toBe(0); // staged only
			imu.write(IMU_PORT_INDEX, IMU_REG_HANDLER + 3);
			imu.write(IMU_PORT_DATAHI, 0x12);
			expect(get(IMU_REG_HANDLER + 3)).toBe(0x1234);
			expect(get(IMU_REG_HBANK + 3)).toBe(0x07);
		});

		it("the bank staged for one ID isn't committed by another's handler", () => {
			const { setHandler, set8, get } = setup();
			set8(IMU_REG_HBANK + 2, 9);
			setHandler(1, 0x2000, 1);
			expect(get(IMU_REG_HBANK + 1)).toBe(1);
			expect(get(IMU_REG_HBANK + 2)).toBe(0);
		});

		it("reserved registers and ports read 0 and ignore writes", () => {
			const { imu, set8, get } = setup();
			for (const reg of [0x04, 0x07, 0x20, 0xff]) {
				set8(reg, 0xaa);
				expect(get(reg)).toBe(0);
			}
			for (let port = 4; port < 16; port++) {
				imu.write(port, 0xaa);
				expect(imu.read(port)).toBe(0);
			}
			expect(imu.read(IMU_PORT_INDEX)).toBe(0xff);
		});
	});

	describe("arbitration", () => {
		it("the lowest PRIO wins; ties go to the lowest ID", () => {
			const { imu, set8, setHandler, enable, eoi } = setup();
			enable();
			for (let id = 0; id < 8; id++) setHandler(id, 0x1000 + id);
			set8(IMU_REG_PRIO + 6, 0);
			set8(IMU_REG_PRIO + 2, 1);
			set8(IMU_REG_PRIO + 5, 1);
			imu.setLine(2, true);
			imu.setLine(5, true);
			imu.setLine(6, true);
			expect(imu.irqVector(0xfc)).toEqual({ id: 6, address: 0x1006 });
			imu.setLine(6, false);
			eoi();
			expect(imu.irqVector(0xfc)).toEqual({ id: 2, address: 0x1002 });
		});

		it("a masked ID can't interrupt", () => {
			const { imu, irq, set8, setHandler, enable } = setup();
			enable();
			setHandler(4, 0x1004);
			set8(IMU_REG_MASK, 0x10);
			imu.setLine(4, true);
			expect(irq).not.toHaveBeenCalled();
			expect(imu.irqVector(0xfc)).toBeUndefined();
			set8(IMU_REG_MASK, 0);
			expect(irq).toHaveBeenLastCalledWith(true);
		});

		it("returns undefined when nothing is eligible", () => {
			const { imu, enable } = setup();
			enable();
			expect(imu.irqVector(0xfc)).toBeUndefined();
		});

		it("a winner without a handler falls back: no ISR bit, no frame, the line stays up", () => {
			const { imu, irq, setHandler, enable, get } = setup();
			enable();
			setHandler(5, 0x1005); // lower priority, with a handler
			imu.setLine(2, true);
			imu.setLine(5, true);
			expect(imu.irqVector(0xfc)).toBeUndefined();
			expect(get(IMU_REG_INSERVICE)).toBe(0);
			expect(imu.getFrames()).toHaveLength(0);
			expect(irq).toHaveBeenLastCalledWith(true);
		});
	});

	describe("nesting and EOI", () => {
		it("an in-service ID blocks itself and lower priorities, not higher ones", () => {
			const { imu, irq, setHandler, enable, get } = setup();
			enable();
			for (let id = 0; id < 8; id++) setHandler(id, 0x1000 + id);
			imu.setLine(4, true);
			expect(imu.irqVector(0xfc)?.id).toBe(4);
			expect(get(IMU_REG_INSERVICE)).toBe(0x10);
			expect(irq).toHaveBeenLastCalledWith(false); // 4 still asserted, but in service
			imu.setLine(6, true); // lower
			expect(irq).toHaveBeenLastCalledWith(false);
			imu.setLine(1, true); // higher
			expect(irq).toHaveBeenLastCalledWith(true);
			expect(imu.irqVector(0xf9)?.id).toBe(1);
			expect(imu.read(IMU_PORT_CURRENT)).toBe(1);
		});

		it("an ID of equal priority is blocked", () => {
			const { imu, irq, set8, setHandler, enable } = setup();
			enable();
			setHandler(1, 0x1001);
			setHandler(2, 0x1002);
			set8(IMU_REG_PRIO + 2, 1);
			imu.setLine(1, true);
			imu.irqVector(0xfc);
			imu.setLine(1, false);
			imu.setLine(2, true);
			expect(irq).toHaveBeenLastCalledWith(false);
		});

		it("EOI clears CURRENT's bit, the highest priority in service, and unblocks", () => {
			const { imu, irq, setHandler, enable, eoi, get } = setup();
			enable();
			for (let id = 0; id < 8; id++) setHandler(id, 0x1000 + id);
			imu.setLine(4, true);
			imu.irqVector(0xfc);
			imu.setLine(4, false);
			imu.setLine(1, true);
			imu.irqVector(0xf9);
			imu.setLine(1, false);
			imu.setLine(6, true);
			expect(get(IMU_REG_INSERVICE)).toBe(0x12);
			eoi();
			expect(get(IMU_REG_INSERVICE)).toBe(0x10);
			expect(imu.read(IMU_PORT_CURRENT)).toBe(4);
			expect(irq).toHaveBeenLastCalledWith(false);
			eoi();
			expect(get(IMU_REG_INSERVICE)).toBe(0);
			expect(imu.read(IMU_PORT_CURRENT)).toBe(IMU_NONE);
			expect(irq).toHaveBeenLastCalledWith(true); // 6, unblocked
			eoi(); // nothing in service: no-op
			expect(get(IMU_REG_INSERVICE)).toBe(0);
		});

		it("auto-EOI: nothing in service, nothing blocked; CURRENT is the innermost vectored handler", () => {
			const { imu, irq, setHandler, enable, get } = setup();
			enable(IMU_CTRL_AUTO_EOI);
			setHandler(4, 0x1004);
			imu.setLine(4, true);
			expect(imu.irqVector(0xfc)?.id).toBe(4);
			expect(get(IMU_REG_INSERVICE)).toBe(0);
			expect(irq).toHaveBeenLastCalledWith(true); // still asserted, not blocked
			expect(imu.read(IMU_PORT_CURRENT)).toBe(4);
			imu.onRti(0xfc);
			expect(imu.read(IMU_PORT_CURRENT)).toBe(IMU_NONE);
		});
	});

	describe("frames and the InterruptContext", () => {
		const context = () => {
			const calls: string[] = [];
			let depth = 0;
			const ctx: InterruptContext = {
				enter: (bank) => {
					calls.push(`enter ${bank}`);
					return 0x100 + depth++;
				},
				exit: (saved) => {
					depth--;
					calls.push(`exit ${saved.toString(16)}`);
				},
			};
			return { ctx, calls };
		};

		it("enters the handler's bank, exits on the matching RTI only", () => {
			const { ctx, calls } = context();
			const { imu, setHandler, enable } = setup(ctx);
			enable();
			setHandler(4, 0x1004, 7);
			imu.setLine(4, true);
			imu.irqVector(0xfc);
			expect(calls).toEqual(["enter 7"]);
			imu.onRti(0xf9); // an RTI used as a jump, deeper in the handler
			expect(calls).toEqual(["enter 7"]);
			imu.onRti(0xfc);
			expect(calls).toEqual(["enter 7", "exit 100"]);
			imu.onRti(0xfc); // a second one: foreign
			expect(calls).toHaveLength(2);
		});

		it("nested IRQs unwind in order", () => {
			const { ctx, calls } = context();
			const { imu, setHandler, enable } = setup(ctx);
			enable();
			setHandler(4, 0x1004, 4);
			setHandler(1, 0x1001, 1);
			imu.setLine(4, true);
			imu.irqVector(0xfc);
			imu.setLine(1, true);
			imu.irqVector(0xf6);
			imu.onRti(0xf6);
			imu.onRti(0xfc);
			expect(calls).toEqual(["enter 4", "enter 1", "exit 101", "exit 100"]);
		});

		it("drops an abandoned frame once the stack has risen above it", () => {
			const { ctx, calls } = context();
			const { imu, setHandler, enable } = setup(ctx);
			enable(IMU_CTRL_AUTO_EOI);
			setHandler(4, 0x1004);
			imu.setLine(4, true);
			imu.irqVector(0xf0);
			imu.onRti(0xf8); // above the frame: it was abandoned
			expect(imu.getFrames()).toHaveLength(0);
			expect(calls).toEqual(["enter 0"]);
		});

		it("a new IRQ at or above an old frame's SP replaces it", () => {
			const { imu, setHandler, enable } = setup();
			enable(IMU_CTRL_AUTO_EOI);
			setHandler(4, 0x1004);
			imu.setLine(4, true);
			imu.irqVector(0xf0);
			imu.irqVector(0xf0);
			expect(imu.getFrames()).toHaveLength(1);
			imu.irqVector(0xe0);
			expect(imu.getFrames()).toHaveLength(2);
		});

		it("doesn't enter a context for a fallback", () => {
			const { ctx, calls } = context();
			const { imu, enable } = setup(ctx);
			enable();
			imu.setLine(4, true);
			imu.irqVector(0xfc);
			expect(calls).toHaveLength(0);
		});
	});

	it("snapshot / restoreSnapshot round-trip", () => {
		const { imu, set8, setHandler, enable } = setup();
		enable();
		set8(IMU_REG_MASK, 0x80);
		set8(IMU_REG_PRIO + 3, 6);
		setHandler(3, 0xbeef, 2);
		set8(IMU_REG_HBANK + 5, 9); // staged
		set8(IMU_REG_HANDLER + 5, 0x42); // staged
		imu.setLine(3, true);
		imu.irqVector(0xfc);
		const state = imu.snapshot();

		const irq = vi.fn();
		const copy = new IMU({ irq });
		copy.restoreSnapshot(structuredClone(state));
		expect(copy.snapshot()).toEqual(state);
		copy.write(IMU_PORT_DATAHI, 0x12); // INDEX still HANDLER 5: commits the staged byte and bank
		copy.write(IMU_PORT_INDEX, IMU_REG_HANDLER + 5);
		expect(copy.read(IMU_PORT_DATALO) | (copy.read(IMU_PORT_DATAHI) << 8)).toBe(0x1242);
		copy.write(IMU_PORT_INDEX, IMU_REG_HBANK + 5);
		expect(copy.read(IMU_PORT_DATALO)).toBe(9);
	});
});
