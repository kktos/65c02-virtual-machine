/**
 * Represents the system bus, handling all memory and I/O operations.
 * It abstracts memory access and allows for Memory-Mapped I/O (MMIO)
 * and other memory management techniques like banking.
 */
export class Bus {
	private memory: Uint8Array;

	constructor(memory: Uint8Array) {
		this.memory = memory;
	}

	/**
	 * Reads a byte from an address, applying MMU/MMIO logic.
	 * The CPU should always use this method.
	 * @param addr The 16-bit address to read from.
	 * @returns The byte at the specified address.
	 */
	read(addr: number): number {
		// Future MMIO logic goes here.
		// For example, reading from a soft switch address on an Apple II:
		// if (addr >= 0xC000 && addr <= 0xC0FF) {
		//   return this.handleSoftSwitchRead(addr);
		// }
		return this.memory[addr] ?? 0;
	}

	/**
	 * Writes a byte to an address, applying MMU/MMIO logic.
	 * The CPU should always use this method.
	 * @param addr The 16-bit address to write to.
	 * @param value The byte value to write.
	 */
	write(addr: number, value: number): void {
		// Future MMIO logic goes here.
		// For example, writing to a soft switch address on an Apple II:
		// if (addr >= 0xC000 && addr <= 0xC0FF) {
		//   this.handleSoftSwitchWrite(addr, value);
		//   return;
		// }
		this.memory[addr] = value;
	}
}
