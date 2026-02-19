import type { DebugGroup } from "@/types/machine.interface";

export const debugVideoModeConf: DebugGroup = {
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
};
