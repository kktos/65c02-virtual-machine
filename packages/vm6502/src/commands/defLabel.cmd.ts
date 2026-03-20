import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { Command, CommandContext, ParamListItemIdentifier } from "@/types/command";

export const defLabel: Command = {
	description: "Define a label <label> at <address> [scope?]",
	paramDef: ["name", "address", "name?"],
	group: "Symbols",
	fn: async ({ vm, params }: CommandContext) => {
		const fulllabel = params[0] as ParamListItemIdentifier;
		const address = params[1] as number;
		const scope = (params[2] as string) || vm.getScope(address);

		const parts = fulllabel.text.split("::");
		const namespace = (parts.length > 1 ? parts[0] : "user") as string;
		const label = (parts.length > 1 ? parts[1] : parts[0]) as string;

		const { getSymbolForAddress, addSymbol } = useSymbols();

		const existingSymbol = getSymbolForAddress(address, scope);
		if (existingSymbol && existingSymbol.ns === namespace) {
			throw new Error(
				`Label '${existingSymbol.label}' already exists at ${formatAddress(address)} in ${namespace} namespace.`,
			);
		}

		try {
			await addSymbol(address, label, namespace, scope);
		} catch (e) {
			return { error: `LABEL: ${e}` };
		}

		return `Label '${label}' defined at ${formatAddress(address)} in scope '${scope}'.`;
	},
};
