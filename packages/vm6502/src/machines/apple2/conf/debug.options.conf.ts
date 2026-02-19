/** biome-ignore-all lint/complexity/useSimpleNumberKeys: Firmware addr in hex */
import type { DebugGroup } from "@/types/machine.interface";
import { debugMemoryConfig } from "./debug.options/debug.memory.conf";
import { debugVideoDisplayConf } from "./debug.options/debug.video.display.conf";
import { debugVideoModeConf } from "./debug.options/debug.video.mode.conf";
import { debugVideoSizeConf } from "./debug.options/debug.video.size.conf";
import { debugVideoTestsConf } from "./debug.options/debug.video.tests.conf";
import { debugVideoTextConf } from "./debug.options/debug.video.text.conf";

export const debugOptionsConfig: DebugGroup[] = [
	debugMemoryConfig,
	debugVideoModeConf,
	debugVideoTextConf,
	debugVideoDisplayConf,
	debugVideoSizeConf,
	debugVideoTestsConf,
];
