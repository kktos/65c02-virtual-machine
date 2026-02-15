import type { DebugGroup } from "@/types/machine.interface";

export const debugVideoTestsConf: DebugGroup = {
	label: "Diagnostics",
	category: "video",
	rows: [
		[
			{
				id: "runTest",
				label: "Video Tests",
				type: "select",
				options: [
					{ label: "None", value: "" },
					{ value: "TEXT40", label: "Text 40 col" },
					{ value: "TEXT80", label: "Text 80 col" },
					{ value: "MIXED40GR", label: "GR: Low-Res Mixed 40cols" },
					{ value: "MIXED80GR", label: "GR: Low-Res Mixed 80cols" },
					{ value: "GR", label: "GR: Low-Res Full" },
					{ value: "MIXEDDGR", label: "DGR: Double Low-Res Mixed" },
					{ value: "DGR", label: "DGR: Double Low-Res Full" },
					{ value: "MIXED40HGR", label: "HGR: Hi-Res Mixed 40cols" },
					{ value: "MIXED80HGR", label: "HGR: Hi-Res Mixed 80cols" },
					{ value: "HGR", label: "HGR: Hi-Res Full" },
					{ value: "MIXEDDHGR", label: "DHGR: Double Hi-Res Mixed" },
					{ value: "DHGR", label: "DHGR: Double Hi-Res Full" },
				],
			},
		],
	],
};
