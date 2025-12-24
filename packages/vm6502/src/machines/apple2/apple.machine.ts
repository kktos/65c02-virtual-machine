import type { MachineConfig } from "@/machines/machine.interface";
import { C1_C7_INTROM, C8_CF_INTROM, LG_CARD_ROM } from "./rom/C1_FF";
import { romSlot1 } from "./rom/slot1.rom";
import { romSlot2 } from "./rom/slot2.rom";
import { romSlot3 } from "./rom/slot3.rom";

export const apple2e: MachineConfig = {
	name: "Apple //e",
	memory: {
		size: 0x10000 * 2 + 16 * 1024, // 128KB main memory + LG Card
		banks: 2, // Main and Aux
		chunks: [
			{
				bank: 1,
				addr: 0xc100,
				data: C1_C7_INTROM + C8_CF_INTROM,
				tag: "int.rom.cx",
			},
			romSlot1,
			romSlot2,
			romSlot3,
			// romSlot6,
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
				data: `
				a9 c1
				8d 54 c0
				8d 0 4
				8d 55 c0
				8d 0 4
				60
				8d 07 c0
				ad 00 c1
				ad 00 c8
				8d 6 c0
				ad 00 c1
				ad 00 c8
				ad 0 c3
				60`,
			},
		],
	},
	css: ["apple2/fonts/fonts.css"],
	bus: { class: "AppleBus", path: "apple2/apple.bus" },
	video: {
		width: 280 * 2,
		height: 192 * 2,
		class: "AppleVideo",
		path: "apple2/apple.video",
	},
};
