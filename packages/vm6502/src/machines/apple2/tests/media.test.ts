// Inserting / ejecting a disk in the SmartPort card (slot 5) through the bus, as the worker does.
import { describe, expect, it, vi } from "vitest";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";

describe("AppleBus media", () => {
	it("ejectMedia empties the drive inserted with insertMedia", () => {
		vi.stubGlobal("self", { postMessage: () => undefined });
		vi.stubGlobal("performance", { now: () => 0 });
		const bus = new AppleBus(new Uint8Array(apple2e.memory.size));
		const card = (bus as unknown as { slots: { diskData: Uint8Array | null }[] }).slots[5]!;

		bus.insertMedia(new Uint8Array(512), { slot: 5, name: "a.po" });
		expect(card.diskData).toHaveLength(512);
		bus.ejectMedia({ slot: 5 });
		expect(card.diskData).toBeNull();
	});
});
