// A machine's expansion slots (MachineConfig.slots): which card in which slot, checked against what the machine
// has. Pure: the UI, the MCP tools and the user's saved setting (useSlots) share these.

import type { SlotLayout, SlotsConfig } from "@/types/machine.interface";

/** Why `cardId` can't go in `slot`, or undefined when it can. */
export function slotError(config: SlotsConfig, slot: number, cardId: string): string | undefined {
	if (!Number.isInteger(slot) || slot < 1 || slot > config.count)
		return `slot ${slot}: the slots are 1 to ${config.count}`;
	const card = config.cards.find((c) => c.id === cardId);
	if (!card) return `slot ${slot}: no card "${cardId}" (the cards: ${config.cards.map((c) => c.id).join(", ")})`;
	if (card.slots && !card.slots.includes(slot))
		return `slot ${slot}: ${card.label} goes in slot ${card.slots.join(", ")} only`;
	return undefined;
}

/** The layout to build the machine with: `stored` (the user's), without what this machine can't take; else the default. */
export function resolveSlotLayout(config: SlotsConfig, stored?: SlotLayout): SlotLayout {
	const layout: SlotLayout = {};
	for (const [key, cardId] of Object.entries(stored ?? config.default)) {
		const slot = Number(key);
		if (!slotError(config, slot, cardId)) layout[slot] = cardId;
	}
	return layout;
}

/**
 * `base` with `changes` applied: slot (number or "4") → a card id, or null / "" to empty it. The other slots are
 * kept. Throws on a slot or a card the machine doesn't have.
 */
export function applySlotChanges(
	config: SlotsConfig,
	base: SlotLayout,
	changes: Record<string, string | null>,
): SlotLayout {
	const layout: SlotLayout = { ...base };
	for (const [key, cardId] of Object.entries(changes)) {
		const slot = Number(key);
		if (cardId === null || cardId === "") {
			if (!Number.isInteger(slot) || slot < 1 || slot > config.count)
				throw new Error(`slot ${key}: the slots are 1 to ${config.count}`);
			delete layout[slot];
			continue;
		}
		const error = slotError(config, slot, cardId);
		if (error) throw new Error(error);
		layout[slot] = cardId;
	}
	return layout;
}

export const sameSlotLayout = (a: SlotLayout, b: SlotLayout) => {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)].map(Number));
	return [...keys].every((slot) => a[slot] === b[slot]);
};
