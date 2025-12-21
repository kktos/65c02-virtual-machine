import type { MachineConfig } from "@/machines/machine.interface";
import { C1_C7_INTROM, C8_CF_INTROM, CxSLOTROM, LG_CARD_ROM } from "./rom/C1_FF";

export const apple2e: MachineConfig = {
	name: "Apple //e",
	memory: {
		size: 0x10000 * 2, // 128KB main memory
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
				addr: 0, //0xD000,
				data: LG_CARD_ROM,
				tag: "lgcard",
			},
		],
	},
	bus: { class: "AppleBus", path: "../machines/apple2/apple.bus" },
	video: {
		width: 280,
		height: 192,
		class: "AppleVideo",
		path: "../machines/apple2/apple.video",
	},
};
