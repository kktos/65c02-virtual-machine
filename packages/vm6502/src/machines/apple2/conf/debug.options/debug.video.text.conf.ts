import type { DebugGroup } from "@/types/machine.interface";
import { IIgsColours } from "./colors.options";

export const debugVideoTextConf: DebugGroup = {
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
				options: IIgsColours,
			},
			{
				id: "textBgColor",
				label: "BG",
				type: "color",
				defaultValue: -1,
				savable: true,
				options: IIgsColours,
			},
		],
	],
};
