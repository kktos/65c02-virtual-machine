// AppleBus.search: the regions of APPLE_SEARCH_REGIONS read the bytes of the bus's own views of memory.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";

describe("AppleBus.search", () => {
	let bus: AppleBus;
	beforeEach(() => {
		vi.stubGlobal("self", { postMessage: () => undefined });
		vi.stubGlobal("performance", { now: () => 0 });
		bus = new AppleBus(new Uint8Array(apple2e.memory.size));
	});

	const PATTERN = [0xde, 0xad, 0xbe, 0xef];
	const found = () => bus.search(PATTERN, 0, 0xffffff);

	it.each([
		["main RAM", 0x00300, "MAIN"],
		["aux RAM", 0x10300, "MAIN"],
	])("finds it in %s", (_, address, location) => {
		PATTERN.forEach((b, i) => bus.writeDebug(address + i, b));
		expect(found()).toEqual([{ address, location }]);
	});

	it.each([
		["the internal $Cx ROM", () => bus.romC, 0xc100, 0x0c600, "INT"],
		["the slots' ROMs", () => bus.slotRoms, 0xc100, 0x0c600, "SLOT"],
		["the ROM", () => bus.rom, 0xd000, 0x0f800, "ROM"],
		["main LC bank 2", () => bus.bank2, 0xd000, 0x0d800, "BANK2"],
		["aux LC bank 2", () => bus.auxbank2, 0xd000, 0x1d800, "BANK2"],
	])("finds it in %s", (_, view, origin, address, location) => {
		view().set(PATTERN, (address & 0xffff) - origin);
		expect(found()).toEqual([{ address, location }]);
	});
});
