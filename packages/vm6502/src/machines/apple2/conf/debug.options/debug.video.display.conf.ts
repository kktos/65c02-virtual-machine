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
			{
				id: "dbgFontSize",
				label: "Size",
				type: "select",
				defaultValue: "X2",
				savable: true,
				options: [
					{ label: "x1", value: "X1" },
					{ label: "x2", value: "X2" },
				],
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
		[
			{
				id: "dbgBgOpacity",
				label: "BG Opacity %",
				type: "number",
				defaultValue: 100,
				min: 0,
				max: 100,
				savable: true,
				disableIf: { optionId: "dbgTextBgColor", value: -1 },
			},
		],
	],
};
