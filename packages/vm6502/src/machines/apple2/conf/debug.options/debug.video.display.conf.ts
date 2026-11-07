import type { DebugGroup } from "@/types/machine.interface";
import { IIgsColours } from "./colors.options";

export const debugVideoDisplayConf: DebugGroup = {
	label: "Display",
	category: "video",
	rows: [
		[
			{
				id: "isMonochrome",
				label: "Monochrome",
				type: "boolean",
			},
		],
		[
			{
				id: "borderColor",
				label: "Border Color",
				type: "color",
				defaultValue: -1,
				savable: true,
				options: IIgsColours,
			},
		],
		[
			{
				id: "debugInfoLabel",
				label: "Debug Info",
				type: "label",
			},
		],
		[
			{
				id: "wannaShowDebug",
				label: "Show",
				type: "boolean",
				savable: true,
			},
		],
		[
			{
				id: "dbgTextFgColor",
				label: "FG",
				type: "color",
				defaultValue: -1,
				savable: true,
				options: IIgsColours,
			},
			{
				id: "dbgTextBgColor",
				label: "BG",
				type: "color",
				defaultValue: -1,
				savable: true,
				options: IIgsColours,
			},
		],
	],
};
