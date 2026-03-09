import type { Command, ParamList } from "@/composables/useCommands";
import { useConsoleSettings } from "@/composables/useConsoleSettings";
import { ExpressionParser } from "@/lib/expressionParser";
import { toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const font: Command = {
	description: 'Set console font properties. Usage: font [name] [size] [color]. Ex: font "arial", 14, $FF0000',
	paramDef: ["rest?"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const rest = params[0] as string | undefined;
		const { fontFamily, fontSize, fontColor } = useConsoleSettings();

		if (!rest) {
			return `Font: '${fontFamily.value}', Size: ${fontSize.value}px, Color: ${fontColor.value}`;
		}

		const args = rest.match(/(?:"[^"]*"|[^, \t]+)/g) || [];

		for (const arg of args) {
			if (arg.startsWith('"') && arg.endsWith('"')) {
				fontFamily.value = arg.slice(1, -1);
				continue;
			}

			try {
				const parser = new ExpressionParser(arg, vm);
				const val = parser.parse();
				const isHex = arg.startsWith("$") || arg.startsWith("0x");

				if (isHex) {
					const hex = toHex(val & 0xffffff, 6);
					fontColor.value = `#${hex}`;
				} else {
					if (val < 100) {
						fontSize.value = val;
					} else {
						const hex = toHex(val & 0xffffff, 6);
						fontColor.value = `#${hex}`;
					}
				}
				// oxlint-disable-next-line no-unused-vars
			} catch (e) {
				fontFamily.value = arg;
			}
		}

		return `Font set to: '${fontFamily.value}', ${fontSize.value}px, ${fontColor.value}`;
	},
};
