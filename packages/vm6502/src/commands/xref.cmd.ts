import { defineCommand } from "@/composables/useCommands";
import { useCrossReferences, type XrefFilter } from "@/composables/useCrossReferences";
import { formatAddress, toHex } from "@/lib/hex.utils";
import type { CommandContext, CommandResult, ParamListItemIdentifier } from "@/types/command";

export const xrefCmd = defineCommand({
	description:
		"Shows static incoming references (branches, JSR, JMP, Loads/Stores).\nUsage: XREF <\u200baddress> [branch|call|access|all]",
	paramDef: ["address", "name?"],
	group: "Memory",
	fn: ({ vm, params }: CommandContext): CommandResult => {
		const targetAddr = params[0] as number;
		const filterParam = params[1] as ParamListItemIdentifier | undefined;

		let filter = "ALL";
		if (filterParam) {
			const f = filterParam.text.toUpperCase();
			if (["BRANCH", "CALL", "ACCESS", "ALL"].includes(f)) filter = f;
			else throw new Error("Invalid filter. Use BRANCH, CALL, ACCESS, or ALL.");
		}

		const { findReferences } = useCrossReferences();
		const results = findReferences(vm, targetAddr, filter as XrefFilter);

		if (results.length === 0) return `No static references found for ${formatAddress(targetAddr)}.`;

		const header = "| Address | Type | Instruction |\n|---|---|---|";
		const rows = results
			.map((r) => {
				const link = `[${formatAddress(r.address)}](command:&disasm_at$${toHex(r.address)} "Click to view in Disasm Viewer")`;
				return `| ${link} | ${r.type} | ${r.instruction} |`;
			})
			.join("\n");

		return {
			content: `Found ${results.length} references to ${formatAddress(targetAddr)}:\n\n${header}\n${rows}`,
			format: "markdown",
		};
	},
});
