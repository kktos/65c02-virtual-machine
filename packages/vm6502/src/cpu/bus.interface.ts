/**
 * Defines the interface for the system bus, which connects the CPU to memory and other devices.
 */
export interface IBus {
	/** Reads an 8-bit value from the specified address. */
	read(address: number, isOpcodeFetch?: boolean): number;

	/** Writes an 8-bit value to the specified address. */
	write(address: number, value: number): void;
}
