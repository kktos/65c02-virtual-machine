import { useSymbols } from "@/composables/useSymbols";
import type { Command, CommandContext, CommandSegment, ParamListItemIdentifier } from "@/types/command";

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
			onComplete: async (lines: string | (CommandSegment | string)[]) => {
				const symbols: { ns: string; label: string; addr: number; scope: string }[] = [];

				const entries = typeof lines === "string" ? lines.split("\n") : lines;
				for (const line of entries) {
					if (line.length < 2)
						throw new Error(
							`Invalid line format: "${typeof line === "string" ? line : line.join(" ")}". Expected: <address> <label>`,
						);

					let addr: number;
					let label: string;
					if (typeof line === "string") {
						let addrStr: string;
						[addrStr, label] = line.split(" ") as [string, string];
						addr = parseInt(addrStr.replace(/^(0x|$)/, ""), 16);
					} else {
						addr = line[0].value;
						label = line[1].text;
					}

					symbols.push({ ns: namespace.text, label, addr, scope });
				}

				if (symbols.length === 0) return "No labels defined.";

				await addManySymbols(symbols);
				return `Defined ${symbols.length} labels in namespace '${namespace.text}' (scope: ${scope}).`;
			},
		};
	},
};
