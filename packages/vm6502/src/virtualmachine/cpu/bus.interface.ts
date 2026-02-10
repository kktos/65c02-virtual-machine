import type { Dict } from "@/types/dict.type";
import type { DebugOption } from "@/types/machine.interface";

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

	/** Loads data into memory, allowing for bank switching or specific hardware handling. */
	load(address: number, data: Uint8Array, bank?: number, tag?: string): void;

	registerTickHandler(handler: (cycles: number) => void): void;
	removeTickHandler(handler: (cycles: number) => void): void;

	/** Optional method to handle keyboard input. */
	pressKey?(key: string, code?: string, ctrl?: boolean, shift?: boolean, alt?: boolean, meta?: boolean): void;

	/** Optional method to handle key release. */
	releaseKey?(key: string, code?: string): void;

	/** Reads memory with optional overrides for debugging/inspection. */
	readDebug?(address: number, overrides?: Dict): number;

	/** Writes memory with optional overrides, bypassing side effects if possible. */
	writeDebug?(address: number, value: number, overrides?: Dict): void;

	/** Returns a list of available debug options for the UI. */
	getDebugOptions?(): DebugOption[];
	setDebugOverrides?(overrides: Dict): void;

	/** Returns a list of machine state specifications for the UI. */
	getMachineStateSpecs?(): MachineStateSpec[];

	/** Saves the internal state of the bus (e.g., softswitch flags). */
	saveState?(): Dict;

	setRegistersView?(view: DataView): void;
	syncState?(): void;
	syncStateFromBuffer?(view: DataView): Dict;
	prepareWorkerPayloads?(): Promise<{ video?: unknown; bus?: unknown }>;

	/** Inserts media (disk, tape, etc.) into the machine. Metadata can specify drive/slot. */
	insertMedia?(data: Uint8Array, metadata?: Dict): void;

	initAudio?(sampleRate: number): void;
	enableAudio?(isEnabled: boolean): void;

	/** Returns the memory scope (e.g., "main", "aux", "rom", "lc_bank1") for the given address based on current state. */
	getScope?(address: number): string;
	/** Returns the possible memory scopes. */
	getScopes?(): string[];
}
