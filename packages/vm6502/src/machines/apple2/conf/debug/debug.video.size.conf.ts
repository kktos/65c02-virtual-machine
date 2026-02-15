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
};
