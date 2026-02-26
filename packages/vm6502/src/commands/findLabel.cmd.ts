import type { Command, ParamList } from "@/composables/useCommands";
import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const findLabel: Command = {
	description: "Find labels matching a query (address or label). Params: <query> [namespace?]",
	paramDef: ["string", "string?"],
	fn: async (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const query = params[0] as string;
		const namespace = (params[1] as string) || "";

		const { findSymbols } = useSymbols();

		const results = findSymbols(query, namespace);

		if (results.length === 0) {
			return `No labels found matching '${query}'` + (namespace ? ` in namespace '${namespace}'.` : ".");
		}

		const output = results
			.sort((a, b) => a.addr - b.addr)
			.map((sym) => {
				const addr = `${formatAddress(sym.addr)}`;
				return `${addr.padEnd(9)} ${sym.ns.padEnd(10)} ${sym.scope.padEnd(10)} ${sym.label}`;
			})
			.join("\n");

		return `Found ${results.length} labels:\nADDR      NAMESPACE  SCOPE      LABEL\n${output}`;
	},
};
