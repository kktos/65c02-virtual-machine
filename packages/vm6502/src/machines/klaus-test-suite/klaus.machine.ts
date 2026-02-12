import type { MachineConfig } from "@/types/machine.interface";
import { KlausTest_RAM } from "./65C02_extended_opcodes_test";

export const klausTest: MachineConfig = {
	name: "KlausTest",
	speed: 0, // maxSpeed
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
	bus: { class: "Bus", path: "klaus-test-suite/klaus.bus" },
	video: {
		width: 280,
		height: 192,
		class: "KlausVideo",
		path: "klaus-test-suite/klaus.video",
	},
};
