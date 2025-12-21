import type { MachineConfig } from "@/machines/machine.interface";
import { C1_C7_INTROM, C8_CF_INTROM, CxSLOTROM, LG_CARD_ROM } from "./rom/C1_FF";

export const apple2e: MachineConfig = {
	name: "Apple //e",
	memory: {
		size: 0x10000 * 2 + 16 * 1024, // 128KB main memory + LG Card
		banks: 2, // Main and Aux
		chunks: [
			{
				bank: 1,
				addr: 0xc100,
				data: C1_C7_INTROM,
			},
			{
				bank: 1,
				addr: 0xc800,
				data: C8_CF_INTROM,
			},
			{
				bank: 0,
				addr: 0xc100,
				data: CxSLOTROM,
			},
			{
				bank: 0,
				addr: 0xd000,
				data: LG_CARD_ROM,
				tag: "lgcard.rom",
			},
			{
				bank: 0,
				addr: 0xd000,
				data: "55 55 55 55",
			},
			{
				bank: 0,
				addr: 0xd000,
				data: "A5 A5 A5 A5",
				tag: "lgcard.bank2",
			},
			{
				bank: 0,
				addr: 0x0300,
				data: "00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF",
			},
		],
	},
	bus: { class: "AppleBus", path: "apple2/apple.bus" },
	video: {
		width: 280,
		height: 192,
		class: "AppleVideo",
		path: "apple2/apple.video",
	},
};
