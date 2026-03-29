import { defineCommand, isParamListItemRange, isParamListItemIdentifier } from "@/composables/useCommands";
import { useSymbols, type SymbolEntry } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { CommandResult, ParamListItemIdentifier, ParamListItemRange } from "@/types/command";

const HEADER = `| Label | Address |\n|---|---|`;
const HEADER_LONG = `| Label | Address | Namespace | Scope | Disk |\n|---|---|---|---|---|`;

export const findLabelCmd = defineCommand({
	description:
		"Find labels matching a query (address, range or partial label). Params: <\u200baddress|name|range> [namespace?]",
	paramDef: ["range|name", "name?"],
	options: [{ name: "long" }] as const,
	group: "Symbols",
	fn: async ({ params, opts }): Promise<CommandResult> => {
		const arg0 = params[0];
		const namespace = params[1] as ParamListItemIdentifier | undefined;
		const nsText = namespace?.text || "";

		const { findSymbols, getSymbolsInRange } = useSymbols();
		let results: SymbolEntry[] = [];
		let queryDesc = "";

		if (isParamListItemRange(arg0)) {
			const range = arg0 as ParamListItemRange;
			results = getSymbolsInRange(range.start, range.end, nsText);
			queryDesc = `in range ${formatAddress(range.start)}-${formatAddress(range.end)}`;
		} else if (typeof arg0 === "number") {
			results = getSymbolsInRange(arg0, arg0, nsText);
			queryDesc = `at address ${formatAddress(arg0)}`;
		} else if (isParamListItemIdentifier(arg0)) {
			results = findSymbols(arg0.text, nsText);
			queryDesc = `matching '${arg0.text}'`;
		} else {
			const text = String(arg0);
			results = findSymbols(text, nsText);
			queryDesc = `matching '${text}'`;
		}

		if (results.length === 0) {
			const nsSuffix = nsText ? ` in namespace '${nsText}'.` : ".";
			return `No labels found ${queryDesc}${nsSuffix}`;
		}

		const rows = results
			.sort((a, b) => a.addr - b.addr)
			.map((sym) => {
				const short = `| ${sym.label} | ${formatAddress(sym.addr)} |`;
				return opts.long ? `${short}| ${sym.ns} | ${sym.scope} | ${sym.disk} |` : short;
			})
			.join("\n");

		const output = `${opts.long ? HEADER_LONG : HEADER}\n${rows}`;

		return {
			content: `Found ${results.length} labels:\n\n${output}`,
			format: "markdown",
		};
	},
});
