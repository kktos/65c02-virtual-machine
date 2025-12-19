import type { MachineConfig } from "@/types/machine.interface";
import { KlausTest_RAM } from "./klaus-test-suite/65C02_extended_opcodes_test";

export const apple2e: MachineConfig = {
	name: "Apple //e",
	memory: {
		size: 0x10000, // 64KB main memory
		banks: 2, // Main and Aux
	},
	busPath: "../machines/apple2/bus.class",
};

export const klausTest: MachineConfig = {
	name: "KlausTest",
	memory: {
		size: 64 * 1024,
		banks: 1,
		chunks: [
			{
				bank: 0,
				addr: 0x0000,
				data: KlausTest_RAM,
			},
			{
				bank: 0,
				addr: 0xfffa,
				// data: "16 27 1C 27 24 27"
				data: "16 27 00 04 24 27",
			},
		],
	},
	busPath: "../machines/klaus-test-suite/bus.class",
};

export const availableMachines: MachineConfig[] = [apple2e, klausTest];
