import type { IBus } from "@/virtualmachine/cpu/bus.interface";

export interface ISlotCard {
	slot: number;

	readRom(offset: number): number;
	writeRom?(offset: number, value: number): void;
	readIo(offset: number): number;
	writeIo(offset: number, value: number): void;
	readExpansion(offset: number): number;
	writeExpansion?(offset: number, value: number): void;
	setRegisters?(view: DataView): void;
	setBus?(bus: IBus): void;
	insertMedia?(data: Uint8Array): void;
	tick?(cycles: number): Float32Array[];
}
