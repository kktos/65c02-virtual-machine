// The cards the user put in a machine's slots (MachineConfig.slots), kept in localStorage by machine name.
// A change takes effect at the next power on: setSlotLayout then loadMachine().

import { applySlotChanges, resolveSlotLayout } from "@/lib/slots.lib";
import type { MachineConfig, SlotLayout } from "@/types/machine.interface";

const STORAGE_KEY = "vm6502_slots";

function readAll(): Record<string, SlotLayout> {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
		return saved && typeof saved === "object" ? saved : {};
	} catch {
		return {};
	}
}

/** What `machine` is built with: the user's layout (what it can't take dropped), else its default. Undefined: no slots. */
export function slotLayoutFor(machine: MachineConfig): SlotLayout | undefined {
	if (!machine.slots?.count) return undefined;
	return resolveSlotLayout(machine.slots, readAll()[machine.name]);
}

/** Saves `layout` as the user's for `machine` (undefined: back to its default). Throws on what it can't take. */
export function setSlotLayout(machine: MachineConfig, layout: SlotLayout | undefined) {
	if (!machine.slots?.count) throw new Error(`${machine.name} has no slots`);
	const all = readAll();
	if (layout) all[machine.name] = applySlotChanges(machine.slots, {}, layout);
	else delete all[machine.name];
	localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
