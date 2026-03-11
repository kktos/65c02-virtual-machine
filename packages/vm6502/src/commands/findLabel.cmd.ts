import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { Command, CommandResult, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const findLabelCmd: Command = {
	description: "Find labels matching a query (address or label). Params: <query> [namespace?]",
	paramDef: ["string", "string?"],
	group: "Symbols",
	fn: async (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList): Promise<CommandResult> => {
		const query = params[0] as string;
		const namespace = (params[1] as string) || "";

		const { findSymbols } = useSymbols();

		const results = findSymbols(query, namespace);

		if (results.length === 0) {
			return `No labels found matching '${query}'` + (namespace ? ` in namespace '${namespace}'.` : ".");
		}

		const header = `| Address | Namespace | Scope | Label | Disk |\n|---|---|---|---|---|`;
		const rows = results
			.sort((a, b) => a.addr - b.addr)
			.map((sym) => {
				const addr = `${formatAddress(sym.addr)}`;
				return `| ${addr} | ${sym.ns} | ${sym.scope} | ${sym.label} | ${sym.disk} |`;
			})
			.join("\n");

		const output = `${header}\n${rows}`;

		return {
			content: `Found ${results.length} labels:\n\n${output}`,
			format: "markdown",
		};
	},
};
