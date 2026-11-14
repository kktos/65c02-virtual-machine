import { describe, expect, it } from "vitest";
import { applySlotChanges, resolveSlotLayout, sameSlotLayout, slotError } from "@/lib/slots.lib";
import type { SlotsConfig } from "@/types/machine.interface";

const config: SlotsConfig = {
	count: 7,
	cards: [
		{ id: "disk", label: "Disk", slots: [5, 6] },
		{ id: "sound", label: "Sound" },
	],
	default: { 4: "sound", 5: "disk" },
};

describe("slots.lib", () => {
	it("slotError: the slot range, the card, the slots the card goes in", () => {
		expect(slotError(config, 4, "sound")).toBeUndefined();
		expect(slotError(config, 0, "sound")).toMatch(/1 to 7/);
		expect(slotError(config, 8, "sound")).toMatch(/1 to 7/);
		expect(slotError(config, 2, "nope")).toMatch(/no card "nope".*disk, sound/);
		expect(slotError(config, 4, "disk")).toMatch(/Disk goes in slot 5, 6 only/);
	});

	it("resolveSlotLayout: the default without a stored layout", () => {
		expect(resolveSlotLayout(config)).toEqual({ 4: "sound", 5: "disk" });
	});

	it("resolveSlotLayout: the stored layout, what the machine can't take dropped", () => {
		expect(resolveSlotLayout(config, { 1: "sound", 2: "disk", 3: "gone", 9: "sound" })).toEqual({ 1: "sound" });
		expect(resolveSlotLayout(config, {})).toEqual({}); // all slots emptied on purpose
	});

	it("applySlotChanges: sets, empties, keeps the others", () => {
		const base = { 4: "sound", 5: "disk" };
		expect(applySlotChanges(config, base, { "7": "sound", "4": null })).toEqual({ 5: "disk", 7: "sound" });
		expect(applySlotChanges(config, base, { 5: "" })).toEqual({ 4: "sound" });
		expect(base).toEqual({ 4: "sound", 5: "disk" }); // not modified
	});

	it("applySlotChanges: throws on what the machine doesn't have", () => {
		expect(() => applySlotChanges(config, {}, { 4: "disk" })).toThrow(/slot 5, 6 only/);
		expect(() => applySlotChanges(config, {}, { 8: null })).toThrow(/1 to 7/);
		expect(() => applySlotChanges(config, {}, { x: "sound" })).toThrow(/1 to 7/);
	});

	it("sameSlotLayout", () => {
		expect(sameSlotLayout({ 4: "a" }, { 4: "a" })).toBe(true);
		expect(sameSlotLayout({ 4: "a" }, { 4: "a", 5: "b" })).toBe(false);
		expect(sameSlotLayout({ 4: "a" }, { 4: "b" })).toBe(false);
	});
});
