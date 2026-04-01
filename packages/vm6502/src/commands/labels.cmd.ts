import { defineCommand } from "@/composables/useCommands";
import { useSymbols } from "@/composables/useSymbols";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

const { addManySymbols } = useSymbols();

export const labelsCmd = defineCommand({
	description: "Define multiple labels. Usage: LABELS <namespace> [<scope>] ... END",
	paramDef: ["name", "name?"],
	group: "Symbols",
	fn: ({ params }: CommandContext) => {
		const namespace = (params[0] as ParamListItemIdentifier).text;
		const scope = (params[1] as ParamListItemIdentifier)?.text || "main";

		const symbols: { ns: string; label: string; addr: number; scope: string }[] = [];

		return {
			__isMultiLineRequest: true,
			prompt: `LABELS ${namespace}|`,
			terminator: "END_LABELS",
			onLine: async (line: string, lineIndex: number) => {
				let [addrStr, label] = line.trim().split(" ") as [string, string];
				addrStr = addrStr.trim().replace(/^(0x|\$)/, "");
				const addr = parseInt(addrStr, 16);

				if (Number.isNaN(addr))
					return { error: `LABELS: Invalid address: "${addrStr}" on line ${lineIndex} "${line}"` };

				symbols.push({ ns: namespace, label, addr, scope });
				return { prompt: `LABELS ${namespace}|` };
			},
			onComplete: async () => {
				if (symbols.length === 0) return "No labels defined.";
				try {
					await addManySymbols(symbols);
				} catch (e) {
					return { error: `LABELS ${namespace}: ${e}` };
				}

				return `Defined ${symbols.length} labels in namespace '${namespace}' (scope: ${scope}).`;
			},
		};
	},
});
