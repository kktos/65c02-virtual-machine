import { useConsoleSettings } from "@/composables/useConsoleSettings";
import { toHex } from "@/lib/hex.utils";
import type { CommandContext, CommandDef } from "@/types/command";

const { fontFamily, fontSize, fontColor, MIN_SIZE, MAX_SIZE } = useConsoleSettings();

export const font: CommandDef = {
	description: 'Set console font properties. Usage: font [name] [size] [color]. Ex: font "arial", 14, $FF0000',
	paramDef: ["rest"],
	group: "Console",
	fn: ({ params }: CommandContext) => {
		if (params.length === 0)
			return `Font: '${fontFamily.value}', Size: ${fontSize.value}px, Color: ${fontColor.value}`;

		for (const arg of params) {
			if (typeof arg === "number") {
				if (arg < MAX_SIZE && arg > MIN_SIZE) {
					fontSize.value = arg;
					continue;
				}
				const hex = toHex(arg & 0xffffff, 6);
				fontColor.value = `#${hex}`;
			}
			if (typeof arg === "string") {
				fontFamily.value = arg;
			}
		}

		return `Font set to: '${fontFamily.value}', ${fontSize.value}px, ${fontColor.value}`;
	},
};
