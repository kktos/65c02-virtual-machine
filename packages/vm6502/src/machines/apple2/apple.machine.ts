/** biome-ignore-all lint/complexity/useSimpleNumberKeys: Firmware addr in hex */
import type { MachineConfig } from "@/types/machine.interface";
import { debugConfig } from "./conf/debug.conf";
import { memoryConfig } from "./conf/memory.conf";
import { regionsConfig } from "./conf/regions.conf";
import { symbolsConfig } from "./conf/symbols.conf";

export const apple2e: MachineConfig = {
	name: "Apple //e",
	memory: memoryConfig,
	css: ["apple2/fonts/fonts.css"],
	bus: { class: "AppleBus", path: "apple2/apple.bus" },
	video: {
		width: 640,
		height: 480,
		class: "AppleVideo",
		path: "apple2/video/apple.video",
		hasTests: true,
	},
	disk: { enabled: true, name: "SPDisk" },
	debugOptions: debugConfig,
	symbols: symbolsConfig,
	regions: regionsConfig,
	inputs: [
		{
			type: "joystick",
			label: "Joystick",
			controls: [
				{ id: "axis_x", label: "Horizontal (Paddle 0)", type: "axis", index: 0 },
				{ id: "axis_y", label: "Vertical (Paddle 1)", type: "axis", index: 1 },
				{ id: "btn_0", label: "Button 0 (Open Apple)", type: "button", index: 0 },
				{ id: "btn_1", label: "Button 1 (Solid Apple)", type: "button", index: 1 },
			],
		},
		{
			type: "mouse",
			label: "Mouse",
			controls: [
				{ id: "axis_x", label: "Mouse X", type: "axis", index: 2 },
				{ id: "axis_y", label: "Mouse Y", type: "axis", index: 3 },
				{ id: "btn_0", label: "Left Button", type: "button", index: 2 },
				{ id: "btn_1", label: "Right Button", type: "button", index: 3 },
			],
		},
	],
};
