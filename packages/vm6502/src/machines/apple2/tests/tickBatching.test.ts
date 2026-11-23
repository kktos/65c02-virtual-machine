// The bus ticks its devices lazily (AppleBus.registerTickHandler): in batches, but at their events' exact cycle
// and before an access to their I/O, so that what the program sees is as if they were ticked after each instruction.
import { describe, expect, it, vi } from "vitest";
import { VIA6522 } from "@/machines/chips/via6522";
import { MEMORY_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";

const newBus = () => {
	vi.stubGlobal("self", { postMessage: () => undefined });
	const buffer = new SharedArrayBuffer(MEMORY_OFFSET + apple2e.memory.size);
	const bus = new AppleBus(new Uint8Array(buffer, MEMORY_OFFSET, apple2e.memory.size));
	bus.setRegistersView(new DataView(buffer, 0, MEMORY_OFFSET)); // the joystick's inputs
	return bus;
};

/** A handler counting the cycles it was given, and how many times it was called. */
const counter = () => {
	const seen = { cycles: 0, calls: 0 };
	return { seen, tick: (cycles: number) => ((seen.cycles += cycles), seen.calls++) };
};

describe("tick batching", () => {
	it("gives a handler all the cycles, in batches", () => {
		const bus = newBus();
		const { seen, tick } = counter();
		bus.registerTickHandler(tick);
		for (let index = 0; index < 1000; index++) bus.tick(4);
		bus.flushTicks();
		expect(seen.cycles).toBe(4000);
		expect(seen.calls).toBeLessThan(10);
	});

	it("ticks a handler on the instruction its event falls in, not later", () => {
		const bus = newBus();
		const { seen, tick } = counter();
		const due = 100;
		bus.registerTickHandler(tick, () => due - seen.cycles);
		bus.tick(1); // its first schedule, at once
		for (let index = 0; index < 32; index++) bus.tick(3); // 97 cycles
		expect(seen.cycles).toBeLessThan(due);
		bus.tick(3); // 100: due
		expect(seen.cycles).toBe(100);
	});

	it("brings a card up to date before an access to its slot's ROM space", () => {
		const bus = newBus();
		const via = new VIA6522({});
		const card = {
			slot: 1, // free (conf/slots.conf.ts)
			tick: (cycles: number) => via.tick(cycles),
			nextEvent: () => via.nextEvent(),
			readRom: (offset: number) => via.read(offset & 0x0f),
			writeRom: (offset: number, value: number) => via.write(offset & 0x0f, value),
			readIo: () => 0,
			writeIo: () => {},
			readExpansion: () => 0,
		};
		bus.installCard(card);
		bus.write(0xc106, 0xff); // T1 latch: $FFFF
		bus.write(0xc105, 0xff); // T1C-H: counting from $FFFF
		bus.tick(10);
		// T1C-L is the counter's low byte: 10 cycles less (the access itself not counted)
		expect(bus.read(0xc104)).toBe(0xff - 10);
	});
});

describe("VIA nextEvent", () => {
	it("is the cycle its one-shot timer 1 sets its flag on", () => {
		const via = new VIA6522({});
		expect(via.nextEvent()).toBe(Number.POSITIVE_INFINITY);
		via.write(0x04, 50); // T1C-L latch
		via.write(0x05, 0); // T1C-H: counts from 50, armed
		expect(via.nextEvent()).toBe(51);
		via.tick(50);
		expect(via.read(0x0d) & 0x40).toBe(0);
		expect(via.nextEvent()).toBe(1);
		via.tick(1);
		expect(via.read(0x0d) & 0x40).toBe(0x40);
		expect(via.nextEvent()).toBe(Number.POSITIVE_INFINITY); // one-shot: done
	});
});
