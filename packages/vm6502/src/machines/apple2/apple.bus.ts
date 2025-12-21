import type { IBus } from "@/cpu/bus.interface";

export class AppleBus implements IBus {
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

	load(address: number, data: Uint8Array, bank: number = 0, tag?: string): void {
		let dest = address;
		// Handle special mapping for Language Card
		if (tag === "lgcard" && dest === 0) {
			dest = 0xd000;
		}

		// Linearize memory: Bank 0 is 0-64K, Bank 1 is 64K-128K
		const physicalAddress = dest + bank * 0x10000;

		if (physicalAddress + data.length > this.memory.length) {
			console.error(`AppleBus: Load out of bounds: 0x${physicalAddress.toString(16)}`);
			return;
		}

		this.memory.set(data, physicalAddress);
	}
}
