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
}
