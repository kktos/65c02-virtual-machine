/** biome-ignore-all lint/complexity/useSimpleNumberKeys: Firmware addr in hex */
import type { MachineConfig } from "@/types/machine.interface";
import { debugConfig } from "./conf/debug.conf";
import { memoryConfig } from "./conf/memory.conf";
import { symbolsConfig } from "./conf/symbols.conf";

export const apple2e: MachineConfig = {
	name: "Apple //e",
	memory: memoryConfig,
	css: ["apple2/fonts/fonts.css"],
	bus: { class: "AppleBus", path: "apple2/apple.bus" },
	video: {
		width: 480 + 10 + 10,
		height: 24 * 21 + 10 + 10,
		class: "AppleVideo",
		path: "apple2/apple.video",
	},
	disk: { enabled: true, name: "SPDisk" },
	debugOptions: debugConfig,
	symbols: symbolsConfig,
};
