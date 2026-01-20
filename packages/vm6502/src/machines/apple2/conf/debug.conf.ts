/** biome-ignore-all lint/complexity/useSimpleNumberKeys: Firmware addr in hex */
import type { MachineConfig } from "@/types/machine.interface";

export const debugConfig: MachineConfig["debugOptions"] = [
	{
		label: "General",
		category: "memory",
		rows: [
			[
				{
					id: "lcView",
					label: "LC ROM",
					type: "select",
					options: [
						{ label: "Auto", value: "AUTO" },
						{ label: "ROM", value: "ROM" },
						{ label: "LC Bank 1", value: "BANK1" },
						{ label: "LC Bank 2", value: "BANK2" },
					],
				},
			],
			[
				{
					id: "cxView",
					label: "Cx ROM",
					type: "select",
					options: [
						{ label: "Auto", value: "AUTO" },
						{ label: "Internal", value: "INT" },
						{ label: "Slots", value: "SLOT" },
					],
				},
			],
		],
	},
	{
		label: "Mode",
		category: "video",
		rows: [
			[
				{
					id: "videoMode",
					label: "Video Mode",
					type: "select",
					options: [
						{ label: "Auto", value: "AUTO" },
						{ label: "Text", value: "TEXT" },
						{ label: "GR", value: "GR" },
						{ label: "HGR", value: "HGR" },
					],
				},
			],
			[
				{
					id: "videoPage",
					label: "Video Page",
					type: "select",
					options: [
						{ label: "Auto", value: "AUTO" },
						{ label: "Page 1", value: "PAGE1" },
						{ label: "Page 2", value: "PAGE2" },
					],
				},
			],
		],
	},
	{
		label: "Text",
		category: "video",
		rows: [
			[
				{
					id: "textRenderer",
					label: "Text Renderer",
					type: "select",
					savable: true,
					options: [
						{ label: "Font", value: "FONT" },
						{ label: "Bitmap", value: "BITMAP" },
					],
				},
			],
			[
				{
					id: "mouseChars",
					label: "Mouse Chars",
					type: "select",
					options: [
						{ label: "Auto", value: "AUTO" },
						{ label: "Mouse Chars", value: "ON" },
						{ label: "Normal Chars", value: "OFF" },
					],
				},
			],
			[
				{
					id: "textFgColor",
					label: "FG",
					type: "color",
					defaultValue: -1,
					savable: true,
					options: [
						{ label: "Auto", value: -1 },
						{ label: "Black", value: 0, color: "#000000" },
						{ label: "D. Red", value: 1, color: "#dd0030" },
						{ label: "D. Blue", value: 2, color: "#000099" },
						{ label: "Purple", value: 3, color: "#dd22dd" },
						{ label: "D. Green", value: 4, color: "#007722" },
						{ label: "D. Gray", value: 5, color: "#555555" },
						{ label: "M. Blue", value: 6, color: "#2222ff" },
						{ label: "Brown", value: 8, color: "#885500" }, // Note: 8 is Brown in IIgs palette
						{ label: "Orange", value: 9, color: "#ff6600" },
						{ label: "L. Gray", value: 10, color: "#aaaaaa" },
						{ label: "Pink", value: 11, color: "#ff9988" },
						{ label: "L. Green", value: 12, color: "#11dd00" },
						{ label: "Yellow", value: 13, color: "#ffff00" },
						{ label: "Aquamarine", value: 14, color: "#41ff99" },
						{ label: "White", value: 15, color: "#ffffff" },
					],
				},
				{
					id: "textBgColor",
					label: "BG",
					type: "color",
					defaultValue: -1,
					savable: true,
					options: [
						{ label: "Auto", value: -1 },
						{ label: "Black", value: 0, color: "#000000" },
						{ label: "D. Red", value: 1, color: "#dd0030" },
						{ label: "D. Blue", value: 2, color: "#000099" },
						{ label: "Purple", value: 3, color: "#dd22dd" },
						{ label: "D. Green", value: 4, color: "#007722" },
						{ label: "D. Gray", value: 5, color: "#555555" },
						{ label: "M. Blue", value: 6, color: "#2222ff" },
						{ label: "Brown", value: 8, color: "#885500" },
						{ label: "Orange", value: 9, color: "#ff6600" },
						{ label: "L. Gray", value: 10, color: "#aaaaaa" },
						{ label: "Pink", value: 11, color: "#ff9988" },
						{ label: "L. Green", value: 12, color: "#11dd00" },
						{ label: "Yellow", value: 13, color: "#ffff00" },
						{ label: "Aquamarine", value: 14, color: "#41ff99" },
						{ label: "White", value: 15, color: "#ffffff" },
					],
				},
			],
		],
	},
	{
		label: "Display",
		category: "video",
		rows: [
			[
				{
					id: "borderColor",
					label: "Border Color",
					type: "color",
					defaultValue: -1,
					savable: true,
					options: [
						{ label: "Auto", value: -1 },
						{ label: "Black", value: 0, color: "#000000" },
						{ label: "D. Red", value: 1, color: "#dd0030" },
						{ label: "D. Blue", value: 2, color: "#000099" },
						{ label: "Purple", value: 3, color: "#dd22dd" },
						{ label: "D. Green", value: 4, color: "#007722" },
						{ label: "D. Gray", value: 5, color: "#555555" },
						{ label: "M. Blue", value: 6, color: "#2222ff" },
						{ label: "Brown", value: 8, color: "#885500" },
						{ label: "Orange", value: 9, color: "#ff6600" },
						{ label: "L. Gray", value: 10, color: "#aaaaaa" },
						{ label: "Pink", value: 11, color: "#ff9988" },
						{ label: "L. Green", value: 12, color: "#11dd00" },
						{ label: "Yellow", value: 13, color: "#ffff00" },
						{ label: "Aquamarine", value: 14, color: "#41ff99" },
						{ label: "White", value: 15, color: "#ffffff" },
					],
				},
			],
		],
	},
	{
		label: "Dimensions",
		category: "video",
		rows: [
			[
				{
					id: "wannaScale",
					label: "Scale",
					type: "boolean",
				},
			],
			[
				{
					id: "canvasSize",
					label: "Canvas Size",
					type: "select",
					savable: true,
					options: [
						{ label: "Auto", value: "AUTO" },
						{ label: "Custom", value: "CUSTOM" },
					],
				},
			],
			[
				{
					id: "customWidth",
					label: "Width",
					type: "number",
					savable: true,
					defaultValue: 640,
					disableIf: { optionId: "canvasSize", value: "AUTO" },
				},
				{
					id: "customHeight",
					label: "Height",
					type: "number",
					savable: true,
					defaultValue: 480,
					disableIf: { optionId: "canvasSize", value: "AUTO" },
				},
			],
		],
	},
];
