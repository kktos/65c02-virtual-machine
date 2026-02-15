/** biome-ignore-all lint/complexity/useSimpleNumberKeys: Firmware addr in hex */
import type { MachineConfig } from "@/types/machine.interface";
import { debugMemoryConfig } from "./debug/debug.memory.conf";
import { debugVideoDisplayConf } from "./debug/debug.video.display.conf";
import { debugVideoModeConf } from "./debug/debug.video.mode.conf";
import { debugVideoSizeConf } from "./debug/debug.video.size.conf";
import { debugVideoTestsConf } from "./debug/debug.video.tests.conf";
import { debugVideoTextConf } from "./debug/debug.video.text.conf";

export const debugConfig: MachineConfig["debugOptions"] = [
	debugMemoryConfig,
	debugVideoModeConf,
	debugVideoTextConf,
	debugVideoDisplayConf,
	debugVideoSizeConf,
	debugVideoTestsConf,
];
