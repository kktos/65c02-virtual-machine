import type { DebugGroup } from "@/types/machine.interface";

export const debugVideoSizeConf: DebugGroup = {
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
				id: "integerScaling",
				label: "Integer Scaling",
				type: "boolean",
				savable: true,
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
		[
			{
				id: "borderLabel",
				label: "Border",
				type: "label",
			},
		],
		[
			{
				id: "borderWidth",
				label: "Width",
				type: "number",
				defaultValue: 40,
				min: 0,
				max: 40,
				savable: true,
			},
			{
				id: "borderHeight",
				label: "Height",
				type: "number",
				defaultValue: 48,
				min: 0,
				max: 48,
				savable: true,
			},
		],
	],
};
