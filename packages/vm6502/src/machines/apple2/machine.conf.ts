import type { MachineConfig } from "@/machines/machine.interface";

export const apple2e: MachineConfig = {
	name: "Apple //e",
	memory: {
		size: 0x10000, // 64KB main memory
		banks: 2, // Main and Aux
	},
	bus: { class: "Bus", path: "../machines/apple2/bus.class" },
	video: {
		width: 280,
		height: 192,
		class: "AppleVideo",
		path: "../machines/apple2/apple.video",
	},
};
