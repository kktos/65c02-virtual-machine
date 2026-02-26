import type { Command, ParamList } from "@/composables/useCommands";
import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const defLabel: Command = {
	description: "Define a label at <address>. Params: <address> <label> [scope?]",
	paramDef: ["address", "string", "string?"],
	fn: async (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;
		const label = params[1] as string;
		const scope = (params[2] as string) || vm.getScope(address);
		const namespace = "user";

		const { getSymbolForAddress, addSymbol } = useSymbols();

		const existingSymbol = getSymbolForAddress(address, scope);
		if (existingSymbol && existingSymbol.ns === namespace) {
			throw new Error(
				`Label '${existingSymbol.label}' already exists at $${formatAddress(address)} in user namespace.`,
			);
		}

		await addSymbol(address, label, namespace, scope);

		return `Label '${label}' defined at $${formatAddress(address)} in scope '${scope}'.`;
	},
};
