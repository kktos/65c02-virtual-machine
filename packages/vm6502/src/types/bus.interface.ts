import type { Dict } from "@/types/dict.type";

export interface MachineStateSpec {
	id: string;
	label: string;
	type: "led" | "hex" | "text";
	group?: string;
}

/**
 * Defines the interface for the system bus, which connects the CPU to memory and other devices.
 */
export interface IBus {
	reset(): void;
	tick(deltaCycles: number): void;

	/** Reads an 8-bit value from the specified address. */
	read(address: number, isOpcodeFetch?: boolean): number;

	/** Reads memory directly, bypassing mapping logic if possible. */
	readRaw?(address: number): number;

	/** Writes an 8-bit value to the specified address. */
	write(address: number, value: number): void;
	ioWrite(address: number, value: number, worker: Worker): void;

	/** Loads data into memory, allowing for bank switching or specific hardware handling. */
	load(address: number, data: Uint8Array, bank?: number, tag?: string): void;

	/**
	 * The CPU's interrupt inputs, given once the CPU is set up: `irq` drives the (level-triggered) IRQ line, the
	 * devices ORed by the bus; `nmi` is an NMI edge. For machines whose devices interrupt the CPU.
	 */
	setInterruptLines?(lines: InterruptLines): void;

	registerTickHandler(handler: (cycles: number) => void): void;
	unregisterTickHandler(handler: (cycles: number) => void): void;

	search(
		pattern: (number | null)[],
		startAddress: number,
		endAddress: number,
		is7Bit: boolean,
		candidates?: number[][],
	): { address: number; location: string }[];

	/** Optional method to handle keyboard input. */
	pressKey?(key: string, code?: string, ctrl?: boolean, shift?: boolean, alt?: boolean, meta?: boolean): void;

	/** Optional method to handle key release. With no key, all the keys are up (the page lost the focus). */
	releaseKey?(key?: string, code?: string): void;

	/**
	 * Keys typed by software (paste, `type_keys`, the `key` command): queued, and given to the program as it reads
	 * them. Returns how many were queued, and skipped (no key for them).
	 */
	typeText?(text: string): { queued: number; skipped: number };

	/** Holds a key down (the first character of `key`, or a key code), until `holdKey(null)`. */
	holdKey?(key: string | number | null): void;

	/** Empties the typed keys queue. */
	clearKeys?(): void;

	/** Cycles after a key is consumed before the next typed key is given (see AppleKeyboard). */
	setKeyDelay?(cycles: number): void;

	getKeyboardState?(): KeyboardState;

	/** Reads memory with optional overrides for debugging/inspection. */
	readDebug?(address: number, overrides?: Dict | string): number;

	/**
	 * What the CPU would read at `address` with the current banking (ALTZP, RAMRD, 80STORE, language card…),
	 * without side effects: no soft switch, no slot ROM switching. For the disassembler's operand values.
	 */
	peek?(address: number): number;

	/** Reads a range of memory with optional overrides for debugging/inspection. */
	readDebugRange?(address: number, length: number, overrides?: Dict | string): Uint8Array;

	/**
	 * The text screen as plain text, one string per row (debug read: no side effects).
	 * Options left out are those of the displayed screen (`getTextMode`) when the bus knows it.
	 */
	getTextScreen?(options?: TextScreenOptions): string[];

	/** Which text screen is displayed, from the video soft switches. */
	getTextMode?(): TextMode;

	/** Writes memory with optional overrides, bypassing side effects if possible. */
	writeDebug?(address: number, value: number, overrides?: Dict): void;

	/** Returns a list of available debug options for the UI. */
	setDebugOverrides?(overrides: Dict): void;

	/** Returns a list of machine state specifications for the UI. */
	getMachineStateSpecs?(): (MachineStateSpec | [MachineStateSpec, MachineStateSpec])[];

	/** Saves the internal state of the bus (e.g., softswitch flags). */
	saveState?(): Dict;

	/**
	 * Everything the bus and its devices hold outside memory (soft switches, counters, cards…), for a save
	 * state: `restoreSnapshot` puts it back. Structured-cloneable; may share immutable data (a disk image).
	 * Live inputs (joystick, paddle positions) are not part of it.
	 */
	snapshot?(): unknown;
	restoreSnapshot?(state: unknown): void;

	setRegistersView?(view: DataView): void;
	syncState?(): void;
	syncStateFromBuffer?(view: DataView): Dict;
	prepareWorkerPayloads?(): Promise<{ video?: unknown; bus?: unknown }>;

	/** Inserts media (disk, tape, etc.) into the machine. Metadata can specify drive/slot. */
	insertMedia?(data: Uint8Array, metadata?: Dict): void;

	/** Removes the media inserted with the same metadata (drive/slot). */
	ejectMedia?(metadata?: Dict): void;

	initAudio?(sampleRate: number): void;
	enableAudio?(isEnabled: boolean): void;
	/** The CPU clock in MHz (0: "Max"), for what runs at the pace of the cycles (e.g. the sound). */
	setClockSpeed?(mhz: number): void;

	/** Returns the memory scope (e.g., "main", "aux", "rom", "lc_bank1") for the given address based on current state. */
	getScope?(address: number): string;
	/** Returns the possible memory scopes. */
	getScopes?(): string[];

	/** Returns the memory bank for address using MMU rules */
	getBank?(address: number): number;
}

/**
 * The keyboard: typed keys waiting, the key held (code), the delay between typed keys (cycles), the latch (the last
 * key, 7 bits) and its strobe, and whether a key is down (the //e's AKD).
 */
export type KeyboardState = {
	queued: number;
	held: number | null;
	delay: number;
	latch: number;
	strobe: boolean;
	keyDown: boolean;
};

/** The CPU's interrupt inputs (see `IBus.setInterruptLines`). */
export type InterruptLines = { irq(active: boolean): void; nmi(): void };

/** Which text screen `getTextScreen` reads. */
export type TextScreenOptions = { page?: 1 | 2; cols?: 40 | 80 };

/**
 * The displayed text screen. `shown`: "full" in text mode, "mixed" when graphics leave only the
 * last 4 rows of text, "hidden" in full-screen graphics.
 */
export type TextMode = { page: 1 | 2; cols: 40 | 80; shown: "full" | "mixed" | "hidden" };
