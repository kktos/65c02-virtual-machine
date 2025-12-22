export interface DebugOption {
	id: string;
	label: string;
	type: "boolean" | "select";
	options?: { label: string; value: string }[];
}

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
	/** Reads an 8-bit value from the specified address. */
	read(address: number, isOpcodeFetch?: boolean): number;

	/** Writes an 8-bit value to the specified address. */
	write(address: number, value: number): void;

	/** Loads data into memory, allowing for bank switching or specific hardware handling. */
	load(address: number, data: Uint8Array, bank?: number, tag?: string): void;

	/** Optional method to handle keyboard input. */
	pressKey?(key: string): void;

	/** Reads memory with optional overrides for debugging/inspection. */
	readDebug?(address: number, overrides?: Record<string, unknown>): number;

	/** Writes memory with optional overrides, bypassing side effects if possible. */
	writeDebug?(address: number, value: number, overrides?: Record<string, unknown>): void;

	/** Returns a list of available debug options for the UI. */
	getDebugOptions?(): DebugOption[];

	/** Returns a list of machine state specifications for the UI. */
	getMachineStateSpecs?(): MachineStateSpec[];

	/** Saves the internal state of the bus (e.g., softswitch flags). */
	saveState?(): Record<string, unknown>;

	/** Loads the internal state of the bus. */
	loadState?(state: Record<string, unknown>): void;

	readStateFromBuffer?(view: DataView): Record<string, boolean>;
	setRegistersView?(view: DataView): void;
	syncState?(): void;
	prepareWorkerPayloads?(): Promise<{ video?: any; bus?: any }>;
	reset?(): void;
}
