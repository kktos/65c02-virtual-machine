/** biome-ignore-all lint/complexity/useSimpleNumberKeys: Firmware addr in hex */
import type { MachineConfig } from "@/types/machine.interface";

export const debugConfig: MachineConfig["debugOptions"] = [
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
];
