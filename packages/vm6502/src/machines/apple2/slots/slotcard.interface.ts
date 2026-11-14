import type { Dict } from "@/types/dict.type";

export interface ISlotCard {
	slot: number;

	readRom(offset: number): number;
	writeRom?(offset: number, value: number): void;
	readIo(offset: number): number;
	writeIo(offset: number, value: number): void;
	readExpansion(offset: number): number;
	writeExpansion?(offset: number, value: number): void;
	setRegisters?(view: DataView): void;
	insertMedia?(data: Uint8Array, metadata?: Record<string, unknown>): void;
	ejectMedia?(): void;
	tick?(cycles: number): void;

	/** The card asserts the IRQ line (the bus ORs the cards: see AppleBus.updateIrq). */
	readonly irq?: boolean;
	/** The Apple's RESET line. */
	reset?(): void;

	setDebugOverrides?(overrides: Dict): void;

	/** The card's state for a save state (see IBus.snapshot), and putting it back. */
	snapshot?(): unknown;
	restoreSnapshot?(state: unknown): void;
}
