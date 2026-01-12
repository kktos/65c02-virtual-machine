import type { MachineConfig } from "@/types/machine.interface";
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
			{
				bank: 0,
				addr: 0x0800,
				data: `
				20 2f fb 20 58 fc a9 00 48 aa 20 24 08 a0 0a 20 a8 fc 88 d0 fa 68
				cd 5f 08 f0 06 18 69 01 48 d0 e8 60 a2 00 08 48 98 48 8a cd 5f 08
				90 02 a9 00 0a aa bd 60 08 8d 5e 08 e8 bd 60 08 8d 40 08 a0 00 98
				aa 98 20 a8 fc 2c 30 c0 e0 80 f0 0b ca d0 f2 88 d0 ed ce 5e 08 d0
				e6 68 a8 68 28 60 01 10 01 08 01 18 ff 01 06 10 01 30 20 06 70 06
				ff 06 01 a0 ff 02 04 1c 01 10 30 0b 30 07 50 09 01 64
				`,
			},
		],
	},
	css: ["apple2/fonts/fonts.css"],
	bus: { class: "AppleBus", path: "apple2/apple.bus" },
	video: {
		width: 480 + 10 + 10,
		height: 24 * 21 + 10 + 10,
		class: "AppleVideo",
		path: "apple2/apple.video",
	},
	disk: { enabled: true, name: "SPDisk" },
	debugOptions: [
		{
			id: "lcView",
			label: "LC ROM",
			type: "select",
			category: "memory",
			options: [
				{ label: "Auto", value: "AUTO" },
				{ label: "ROM", value: "ROM" },
				{ label: "LC Bank 1", value: "BANK1" },
				{ label: "LC Bank 2", value: "BANK2" },
			],
		},
		{
			id: "cxView",
			label: "Cx ROM",
			type: "select",
			category: "memory",
			options: [
				{ label: "Auto", value: "AUTO" },
				{ label: "Internal", value: "INT" },
				{ label: "Slots", value: "SLOT" },
			],
		},
		{
			id: "videoMode",
			label: "Video Mode",
			type: "select",
			category: "video",
			options: [
				{ label: "Auto", value: "AUTO" },
				{ label: "Text", value: "TEXT" },
				{ label: "HGR", value: "HGR" },
			],
		},
		{
			id: "videoPage",
			label: "Video Page",
			type: "select",
			category: "video",
			options: [
				{ label: "Auto", value: "AUTO" },
				{ label: "Page 1", value: "PAGE1" },
				{ label: "Page 2", value: "PAGE2" },
			],
		},
	],
};
