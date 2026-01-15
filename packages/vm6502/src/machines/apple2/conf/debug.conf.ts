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
	{
		id: "textRenderer",
		label: "Text Renderer",
		type: "select",
		category: "video",
		options: [
			{ label: "Font", value: "FONT" },
			{ label: "Bitmap", value: "BITMAP" },
		],
	},
	{
		id: "backgroundColor",
		label: "Text BG",
		type: "select",
		category: "video",
		defaultValue: "#000000",
		options: [
			{ label: "Black", value: "#000000" },
			{ label: "D. Red", value: "#DD0030" },
			{ label: "D. Blue", value: "#000099" },
			{ label: "Purple", value: "#DD22DD" },
			{ label: "D. Green", value: "#007722" },
			{ label: "D. Gray", value: "#555555" },
			{ label: "M. Blue", value: "#2222FF" },
			{ label: "Orange", value: "#FF6600" },
			{ label: "L. Gray", value: "#AAAAAA" },
			{ label: "L. Green", value: "#11DD00" },
			{ label: "White", value: "#FFFFFF" },
		],
	},
	{
		id: "wannaScale",
		label: "Scale",
		type: "boolean",
		category: "video",
	},
];
