import { defineCommand } from "@/composables/useCommands";
import { labelsLineToSymbol, parseLabelsLine, useSymbols, type AddressRange } from "@/composables/useSymbols";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

const { addManySymbols, addAddressRanges } = useSymbols();

export const labelsCmd = defineCommand({
	description:
		"Define multiple labels. Usage: LABELS <\u200bnamespace> [<\u200bscope>] ... END_LABELS. " +
		"Lines: $ADDR label | $START:$END label (sized label) | $START:$END [noindex] (no label on an indexed operand there)",
	paramDef: ["name", "name?"],
	group: "Symbols",
	fn: ({ params }: CommandContext) => {
		const namespace = (params[0] as ParamListItemIdentifier).text;
		const scope = (params[1] as ParamListItemIdentifier)?.text || "main";

		const symbols: { ns: string; label: string; addr: number; scope: string; size?: number }[] = [];
		const ranges: AddressRange[] = [];

		return {
			__isMultiLineRequest: true,
			prompt: `LABELS ${namespace}|`,
			terminator: "END_LABELS",
			onLine: async (line: string, lineIndex: number) => {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith(";")) return { prompt: `LABELS ${namespace}|` };

				const parsed = parseLabelsLine(trimmed);
				if (typeof parsed === "string") return { error: `LABELS: ${parsed} on line ${lineIndex}` };

				if (parsed.label) symbols.push(labelsLineToSymbol(parsed, namespace, scope));
				if (parsed.flags.length)
					ranges.push({
						ns: namespace,
						scope,
						start: parsed.start,
						end: parsed.end ?? parsed.start,
						flags: parsed.flags,
					});
				return { prompt: `LABELS ${namespace}|` };
			},
			onComplete: async () => {
				if (symbols.length === 0 && ranges.length === 0) return "No labels defined.";
				try {
					await addManySymbols(symbols);
				} catch (e) {
					return { error: `LABELS ${namespace}: ${e}` };
				}
				addAddressRanges(ranges);

				const rangesMsg = ranges.length ? ` and ${ranges.length} address ranges` : "";
				return `Defined ${symbols.length} labels${rangesMsg} in namespace '${namespace}' (scope: ${scope}).`;
			},
		};
	},
});
