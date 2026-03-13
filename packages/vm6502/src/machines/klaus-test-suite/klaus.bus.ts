import type { IBus } from "@/virtualmachine/cpu/bus.interface";

export class Bus implements IBus {
	private memory: Uint8Array;

	constructor(memory: Uint8Array) {
		this.memory = memory;
	}

	read(address: number, _isOpcodeFetch?: boolean): number {
		if (address < 0 || address >= this.memory.length)
			throw new Error(`Memory read out of bounds: 0x${address.toString(16)}`);
		return this.memory[address] ?? 0;
	}

	write(address: number, value: number): void {
		this.memory[address] = value & 0xff;
	}

	load(address: number, data: Uint8Array, _bank?: number, _tag?: string): void {
		this.memory.set(data, address);
	}
}
