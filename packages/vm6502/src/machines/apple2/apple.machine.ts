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
				data: C1_C7_INTROM + C8_CF_INTROM,
				tag: "int.rom.cx",
			},
			{
				bank: 0,
				addr: 0xc100,
				data: CxSLOTROM,
				tag: "slots.rom",
			},
			{
				bank: 0,
				addr: 5,
				data: `
					A9 20 A9 00 C9 03 A9 00 90 40 38 B0 01 18 08 78
					A5 00 A2 60 86 00 20 00 00 85 00 BA BD 00 01 0A
					0A 0A 0A 8D 78 04 28 B0 55 A5 3C 48 A5 3D 48 BD
					02 01 85 3C 69 03 9D 02 01 BD 03 01 85 3D 69 00
					9D 03 01 A0 01 D0 65 4C BA FA 2C 61 C0 30 F8 20
					58 FF BA BD 00 01 0A 0A 0A 0A 8D 78 04 AA 9D 83
					C0 A9 00 9D 82 C0 BD 80 C0 4A B0 DB A9 01 85 42
					86 43 A9 00 85 44 85 46 85 47 A9 08 85 45 08 AE
					78 04 A0 00 B9 42 00 9D 89 C0 C8 C0 06 90 F5 BD
					80 C0 30 FB 28 B0 06 4A B0 AD 4C 01 08 4A A4 42
					D0 09 48 BC 8A C0 BD 89 C0 AA 68 60 B1 3C C9 03
					F0 02 B0 34 AE 78 04 9D 8A C0 C8 B1 3C 48 C8 B1
					3C 85 3D 68 85 3C A0 00 B1 3C B0 06 C9 03 F0 06
					D0 19 C9 01 D0 15 C8 B1 3C 9D 8A C0 C0 06 90 F6
					BD 80 C0 30 FB 4A AA 2C A2 01 2C A2 04 68 85 3D
					68 85 3C 8A A2 00 A0 02 60 00 00 00 00 00 FF 0A
				`,
				tag: "slot.rom",
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
