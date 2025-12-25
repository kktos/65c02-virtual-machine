import type { IBus } from "../bus.interface";

/**
 * A mock implementation of the Bus for isolated CPU testing.
 * It simulates a simple RAM space.
 */
export class MockBus implements IBus {
	private memory: Uint8Array;

	constructor(memorySize: number = 0x10000) {
		this.memory = new Uint8Array(memorySize).fill(0);
	}

	read(address: number): number {
		if (address < 0 || address >= this.memory.length) {
			throw new Error(`Memory read out of bounds: 0x${address.toString(16)}`);
		}
		return this.memory[address] ?? 0;
	}

	write(address: number, value: number): void {
		this.memory[address] = value & 0xff; // Ensure value is 8-bit
	}

	load(startAddress: number, data: number[]): void {
		data.forEach((byte, i) => this.write(startAddress + i, byte));
	}
}
