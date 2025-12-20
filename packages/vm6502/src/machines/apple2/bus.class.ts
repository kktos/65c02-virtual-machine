import type { IBus } from "@/cpu/bus.interface";

export class Bus implements IBus {
	private memory: Uint8Array;

	constructor(memory: Uint8Array) {
		this.memory = memory;
	}

	read(address: number): number {
		if (address < 0 || address >= this.memory.length)
			throw new Error(`Memory read out of bounds: 0x${address.toString(16)}`);
		return this.memory[address] ?? 0;
	}

	write(address: number, value: number): void {
		this.memory[address] = value & 0xff;
	}
}
