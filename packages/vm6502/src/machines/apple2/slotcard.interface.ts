import type { IBus } from "@/cpu/bus.interface";

export interface ISlotCard {
	readRom(offset: number): number;
	readIo(offset: number): number;
	writeIo(offset: number, value: number): void;
	readExpansion(offset: number): number;
	setRegisters?(view: DataView): void;
	setBus?(bus: IBus): void;
	insertMedia?(data: Uint8Array): void;
}
