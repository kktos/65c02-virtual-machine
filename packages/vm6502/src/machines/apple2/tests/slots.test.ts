// The cards the //e bus is built with (BusOptions.slots), and where a disk goes then.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";
import { MockingboardCard } from "../slots/mockingboard/mockingboard.card";
import { MouseCard } from "../slots/mouse.card";
import { SmartPortCard } from "../slots/smartport.card";
import { ThunderClockCard } from "../slots/thunderclock.card";

const makeBus = (slots?: Record<number, string>) => new AppleBus(new Uint8Array(apple2e.memory.size), { slots });

describe("//e slots", () => {
	beforeEach(() => {
		vi.stubGlobal("self", { postMessage: () => undefined });
		vi.stubGlobal("performance", { now: () => 0 });
	});

	it("the default layout without options", () => {
		const { slots } = makeBus();
		expect(slots[2]).toBeInstanceOf(ThunderClockCard);
		expect(slots[4]).toBeInstanceOf(MouseCard);
		expect(slots[5]).toBeInstanceOf(SmartPortCard);
		expect(slots[7]).toBeInstanceOf(MockingboardCard);
		expect([1, 3, 6].map((s) => slots[s])).toEqual([null, null, null]);
	});

	it("the cards where the layout puts them, the others empty", () => {
		const bus = makeBus({ 4: "mockingboard", 7: "mouse", 6: "smartport" });
		expect(bus.slots[4]).toBeInstanceOf(MockingboardCard);
		expect(bus.slots[7]).toBeInstanceOf(MouseCard);
		expect(bus.slots[6]).toBeInstanceOf(SmartPortCard);
		expect(bus.slots.filter(Boolean)).toHaveLength(3);
		// the Mockingboard's VIA at $C400 (ORB/ORA read back DDR-masked: write DDRB then ORB)
		bus.write(0xc402, 0xff);
		bus.write(0xc400, 0x5a);
		expect(bus.read(0xc400)).toBe(0x5a);
	});

	it("a card's firmware in its own slot's ROM space", () => {
		const bus = makeBus({ 1: "thunderclock" });
		expect([0, 2, 4, 6].map((i) => bus.read(0xc100 + i))).toEqual([0x08, 0x28, 0x58, 0x70]); // ProDOS clock id
	});

	it("an unknown card leaves its slot empty", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const bus = makeBus({ 2: "nope", 4: "mouse" });
		expect(bus.slots[2]).toBeNull();
		expect(bus.slots[4]).toBeInstanceOf(MouseCard);
		expect(error).toHaveBeenCalledWith(expect.stringContaining('no card "nope"'));
		error.mockRestore();
	});

	it("a disk without a slot goes to the card that takes one, wherever it is", () => {
		const bus = makeBus({ 6: "smartport" });
		const card = bus.slots[6] as unknown as { diskData: Uint8Array | null };
		bus.insertMedia(new Uint8Array(512), { name: "a.po" });
		expect(card.diskData).toHaveLength(512);
		bus.ejectMedia();
		expect(card.diskData).toBeNull();
	});

	it("no card takes a disk: a warning, nothing else", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		makeBus({ 4: "mouse" }).insertMedia(new Uint8Array(512), { name: "a.po" });
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("takes a disk"));
		warn.mockRestore();
	});
});
