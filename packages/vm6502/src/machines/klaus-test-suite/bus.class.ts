import type { IBus } from "@/cpu/bus.interface";

export class Bus implements IBus {
	private memory: Uint8Array;

	constructor(memory: Uint8Array) {
		this.memory = memory;
	}

	read(address: number, isOpcodeFetch?: boolean): number {
		if (address < 0 || address >= this.memory.length) {
			throw new Error(`Memory read out of bounds: 0x${address.toString(16)}`);
		}

		if (!isOpcodeFetch)
			console.log(
				`read ${address.toString(16).padStart(4, "0")}:${(this.memory[address] ?? 0).toString(16).padStart(2, "0")}`,
			);

		return this.memory[address] ?? 0;
	}

	write(address: number, value: number): void {
		this.memory[address] = value & 0xff;
	}
}
