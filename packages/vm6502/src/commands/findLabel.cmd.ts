import { defineCommand } from "@/composables/useCommands";
import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { CommandContext, CommandResult, ParamListItemIdentifier } from "@/types/command";

const HEADER = `| Address | Namespace | Scope | Label | Disk |\n|---|---|---|---|---|`;

export const findLabelCmd = defineCommand({
	description: "Find labels matching a query (address or label). Params: <query> [namespace?]",
	paramDef: ["name", "name?"],
	group: "Symbols",
	fn: async ({ params }: CommandContext): Promise<CommandResult> => {
		const query = params[0] as ParamListItemIdentifier;
		const namespace = params[1] as ParamListItemIdentifier | undefined;

		const { findSymbols } = useSymbols();

		const results = findSymbols(query.text, namespace?.text);

		if (results.length === 0)
			return (
				`No labels found matching '${query.text}'` + (namespace ? ` in namespace '${namespace.text}'.` : ".")
			);

		const rows = results
			.sort((a, b) => a.addr - b.addr)
			.map((sym) => {
				const addr = `${formatAddress(sym.addr)}`;
				return `| ${addr} | ${sym.ns} | ${sym.scope} | ${sym.label} | ${sym.disk} |`;
			})
			.join("\n");

		const output = `${HEADER}\n${rows}`;

		return {
			content: `Found ${results.length} labels:\n\n${output}`,
			format: "markdown",
		};
	},
});
