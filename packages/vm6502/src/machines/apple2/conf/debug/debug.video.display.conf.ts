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
				id: "wannaShowDebug",
				label: "Show Debug Info",
				type: "boolean",
				savable: true,
			},
		],
		[
			{
				id: "dbgTextFgColor",
				label: "Debug Info FG",
				type: "color",
				defaultValue: -1,
				savable: true,
				options: IIgsColours,
			},
			{
				id: "dbgTextBgColor",
				label: "Debug Info BG",
				type: "color",
				defaultValue: -1,
				savable: true,
				options: IIgsColours,
			},
		],
	],
};
