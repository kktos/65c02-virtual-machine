import { useSymbols } from "@/composables/useSymbols";
import { parseValue } from "@/lib/parse.utils";
import type { Command, CommandContext, ParamListItemIdentifier } from "@/types/command";

const { addManySymbols } = useSymbols();

export const labelsCmd: Command = {
	description: "Define multiple labels. Usage: LABELS <namespace> [<scope>] ... END",
	paramDef: ["name", "name?"],
	group: "Symbols",
	fn: ({ params }: CommandContext) => {
		const namespace = params[0] as ParamListItemIdentifier;
		const scope = (params[1] as ParamListItemIdentifier)?.text || "main";

		return {
			__isMultiLineRequest: true,
			prompt: `LABELS ${namespace}|`,
			terminator: "END",
			onComplete: async (lines: string[]) => {
				const symbols: { ns: string; label: string; addr: number; scope: string }[] = [];

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;

					const parts = trimmed.split(/\s+/) as [string, string];
					if (parts.length < 2)
						throw new Error(`Invalid line format: "${line}". Expected: <address> <label>`);

					const addrStr = parts[0];
					const label = parts[1];
					const addr = parseValue(addrStr, 0xffffff);

					symbols.push({ ns: namespace.text, label, addr, scope });
				}

				if (symbols.length === 0) return "No labels defined.";

				await addManySymbols(symbols);
				return `Defined ${symbols.length} labels in namespace '${namespace.text}' (scope: ${scope}).`;
			},
		};
	},
};
