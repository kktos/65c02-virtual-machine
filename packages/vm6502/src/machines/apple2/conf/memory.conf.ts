/** biome-ignore-all lint/complexity/useSimpleNumberKeys: Firmware addr in hex */
import type { MachineConfig } from "@/types/machine.interface";
import { C1_C7_INTROM, C8_CF_INTROM, LG_CARD_ROM } from "../rom/C1_FF";
import { romSlot3 } from "../rom/slot3.rom";

export const memoryConfig: MachineConfig["memory"] = {
	size: 0x10000 * 2 + 16 * 1024, // 128KB main memory + LG Card
	banks: 2, // Main and Aux
	chunks: [
		{
			bank: 1,
			addr: 0xc100,
			data: C1_C7_INTROM + C8_CF_INTROM,
			tag: "int.rom.cx",
		},
		// romSlot1,
		// romSlot2,
		romSlot3,
		// romSlot6,
		{
			bank: 0,
			addr: 0xd000,
			data: LG_CARD_ROM,
			tag: "lgcard.rom",
		},
	],
};
