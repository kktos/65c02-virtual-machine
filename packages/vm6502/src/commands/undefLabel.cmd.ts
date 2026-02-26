import type { Command, ParamList } from "@/composables/useCommands";
import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const undefLabel: Command = {
	description: "Remove a user-defined label at <address>. Params: <address> [scope?]",
	paramDef: ["address", "string?"],
	fn: async (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;
		const scope = (params[1] as string) || vm.getScope(address);
		const namespace = "user";

		const { getSymbolForAddress, removeSymbol } = useSymbols();

		const symbolToRemove = getSymbolForAddress(address, scope);

		if (!symbolToRemove) {
			throw new Error(`No label found at $${formatAddress(address)}.`);
		}

		if (symbolToRemove.ns !== namespace) {
			throw new Error(
				`Label '${symbolToRemove.label}' at $${formatAddress(address)} is not a user-defined label.`,
			);
		}

		if (!symbolToRemove.id) {
			throw new Error(`Cannot remove label '${symbolToRemove.label}' without an ID.`);
		}

		await removeSymbol(symbolToRemove.id);

		return `Label '${symbolToRemove.label}' removed from $${formatAddress(address)}.`;
	},
};
