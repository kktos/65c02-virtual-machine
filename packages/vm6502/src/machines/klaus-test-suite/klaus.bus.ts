import type { IBus } from "@/types/bus.interface";

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

	load(address: number, data: Uint8Array, _bank?: number, _tag?: string) {
		this.memory.set(data, address);
	}

	ioWrite(_address: number, _value: number, _worker: Worker) {}
	reset() {}
	tick(_deltaCycles: number) {}
	registerTickHandler(_handler: (cycles: number) => void) {}
	unregisterTickHandler(_handler: (cycles: number) => void) {}
	search(
		_pattern: (number | null)[],
		_startAddress: number,
		_endAddress: number,
		_is7Bit: boolean,
		_candidates?: number[][],
	) {
		return [];
	}
}
