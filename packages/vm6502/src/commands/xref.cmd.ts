import { defineCommand, isParamListItemRange } from "@/composables/useCommands";
import { useCrossReferences, type XrefFilter } from "@/composables/useCrossReferences";
import { formatAddress, toHex } from "@/lib/hex.utils";
import type { CommandResult, ParamListItemIdentifier, ParamListItemRange } from "@/types/command";

export const xrefCmd = defineCommand({
	description:
		"Shows static incoming references (branches, JSR, JMP, Loads/Stores).\nUsage: XREF <\u200baddress> [range] [branch|call|access|all] [--extended]",
	paramDef: ["address", "range?", "name?"],
	options: [{ name: "extended" }] as const,
	group: "Memory",
	fn: ({ vm, params, opts }): CommandResult => {
		const targetAddr = params[0] as number;
		let range: ParamListItemRange | undefined;
		let filterParam: ParamListItemIdentifier | undefined;

		if (isParamListItemRange(params[1])) {
			range = params[1];
			filterParam = params[2] as ParamListItemIdentifier | undefined;
		} else {
			filterParam = params[1] as ParamListItemIdentifier | undefined;
		}

		let filter = "ALL";
		if (filterParam) {
			const f = filterParam.text.toUpperCase();
			if (["BRANCH", "CALL", "ACCESS", "ALL"].includes(f)) filter = f;
			else if (!range) throw new Error("Invalid filter. Use BRANCH, CALL, ACCESS, or ALL.");
		}

		const includeExtended = opts.extended;

		const { findReferences } = useCrossReferences();
		const results = findReferences(vm, targetAddr, filter as XrefFilter, includeExtended, range);

		if (results.length === 0) {
			let msg = `No static references found for ${formatAddress(targetAddr)}`;
			if (range) msg += ` in range ${formatAddress(range.start)}-${formatAddress(range.end)}`;
			return msg + ".";
		}

		const header = "| Address | Type | Instruction |\n|---|---|---|";
		const rows = results
			.map((r) => {
				const link = `[${formatAddress(r.address)}](command:&disasm_at%20$${toHex(r.address)}%20@CTRL "Click to view in Disasm Viewer")`;
				const typeStr = r.isExtended ? `${r.type}*` : r.type;
				return `| ${link} | ${typeStr} | ${r.instruction} |`;
			})
			.join("\n");

		let title = `Found ${results.length} references to ${formatAddress(targetAddr)}`;
		if (range) title += ` in range ${formatAddress(range.start)}-${formatAddress(range.end)}`;
		if (includeExtended) title += " (including bit-ops)";

		return {
			content: `${title}:\n\n${header}\n${rows}${results.some((r) => r.isExtended) ? "\n\n* = Extended 65C02 bit manipulation instruction" : ""}`,
			format: "markdown",
		};
	},
});
