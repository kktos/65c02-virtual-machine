import { describe, expect, it, vi } from "vitest";
import { VIA6522 } from "../via6522";

describe("VIA 6522", () => {
	it("T1 counts down from power-up, unloaded: two reads of T1C-L differ by the cycles between them", () => {
		const via = new VIA6522({});
		const first = via.read(4);
		via.tick(8);
		expect((first - via.read(4)) & 0xff).toBe(8);
	});

	it("T1 one-shot: interrupts once, then counts on from $FFFF without interrupting again", () => {
		const irq = vi.fn();
		const via = new VIA6522({ irq });
		via.write(0x0e, 0xc0); // T1 IRQ enabled
		via.write(4, 0x10);
		via.write(5, 0x00); // $0010
		via.tick(16);
		expect(via.irq).toBe(false);
		via.tick(1);
		expect(via.irq).toBe(true);
		expect(via.read(0x0d)).toBe(0xc0);
		expect(irq).toHaveBeenLastCalledWith(true);
		via.read(4); // acknowledged
		expect(via.irq).toBe(false);
		expect(irq).toHaveBeenLastCalledWith(false);
		via.tick(0x20000);
		expect(via.irq).toBe(false);
	});

	it("T1 free-run: reloads from its latch every N+2 cycles, interrupting each time", () => {
		const via = new VIA6522({});
		via.write(0x0e, 0xc0);
		via.write(0x0b, 0x40); // free-run
		via.write(4, 0x00);
		via.write(5, 0x01); // $0100: a period of $102
		let count = 0;
		for (let cycle = 0; cycle < 0x102 * 10; cycle += 2) {
			via.tick(2);
			if (via.irq) {
				count++;
				via.read(4);
			}
		}
		expect(count).toBe(10);
	});

	it("T2 one-shot: interrupts once", () => {
		const via = new VIA6522({});
		via.write(0x0e, 0xa0);
		via.write(8, 0x05);
		via.write(9, 0x00);
		via.tick(6);
		expect(via.read(0x0d) & 0x20).toBe(0x20);
		via.read(8);
		via.tick(0x20000);
		expect(via.irq).toBe(false);
	});

	it("reads the T1 latches; writing T1L-H clears the T1 flag", () => {
		const via = new VIA6522({});
		via.write(0x0e, 0xc0);
		via.write(6, 0x34);
		via.write(7, 0x12);
		expect(via.read(6)).toBe(0x34);
		expect(via.read(7)).toBe(0x12);
		via.write(5, 0x00);
		via.tick(0x40);
		expect(via.irq).toBe(true);
		via.write(7, 0x12);
		expect(via.irq).toBe(false);
	});

	it("gives the port pins (outputs, inputs pulled high) when they change", () => {
		const writePortB = vi.fn();
		const via = new VIA6522({ writePortB });
		via.write(0, 0x04);
		expect(writePortB).not.toHaveBeenCalled(); // all inputs: still $FF
		via.write(2, 0x07); // PB0-PB2 out
		expect(writePortB).toHaveBeenLastCalledWith(0xfc);
		via.write(0, 0x04);
		expect(writePortB).toHaveBeenCalledTimes(1); // unchanged
		via.write(0, 0x06);
		expect(writePortB).toHaveBeenLastCalledWith(0xfe);
	});

	it("register $F is ORA without handshake", () => {
		const writePortA = vi.fn();
		const via = new VIA6522({ writePortA });
		via.write(3, 0xff);
		via.write(0x0f, 0x5a);
		expect(writePortA).toHaveBeenLastCalledWith(0x5a);
		expect(via.read(1)).toBe(0x5a);
	});
});
