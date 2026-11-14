import type { SlotCardType, SlotsConfig } from "@/types/machine.interface";

/**
 * Not slot 3: on a //e its $C300 space is the 80-column firmware (a ROM chunk loaded over the slot ROMs, see
 * memory.conf.ts), the slot's card seen only with SLOTC3ROM on.
 */
const CARD_SLOTS = [1, 2, 4, 5, 6, 7];

const cards = [
	{ id: "smartport", label: "SmartPort hard disk", slots: CARD_SLOTS },
	{ id: "mouse", label: "AppleMouse", slots: CARD_SLOTS },
	{ id: "thunderclock", label: "ThunderClock (ProDOS clock)", slots: CARD_SLOTS },
	{ id: "mockingboard", label: "Mockingboard", slots: CARD_SLOTS },
] as const satisfies readonly SlotCardType[];

/** The cards the bus builds (CARD_FACTORIES, apple.bus.ts, has one per id). */
export type AppleCardId = (typeof cards)[number]["id"];

export const slotsConfig: SlotsConfig = {
	count: 7,
	cards: [...cards],
	builtin: { 3: "80-column card" },
	default: { 2: "thunderclock", 4: "mouse", 5: "smartport", 7: "mockingboard" },
};
