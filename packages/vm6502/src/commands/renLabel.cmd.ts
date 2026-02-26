import type { Command, ParamList } from "@/composables/useCommands";
import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const renLabel: Command = {
	description: "Rename a user-defined label. Params: <old_label> <new_label> [scope?]",
	paramDef: ["string", "string", "string?"],
	fn: async (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const oldLabel = params[0] as string;
		const newLabel = params[1] as string;
		const scope = params[2] as string | undefined;
		const namespace = "user";

		const { findSymbols, updateSymbol } = useSymbols();

		const potentialSymbols = findSymbols(oldLabel, namespace).filter(
			(s) => s.label.toUpperCase() === oldLabel.toUpperCase(),
		);

		const symbolsToUpdate = scope ? potentialSymbols.filter((s) => s.scope === scope) : potentialSymbols;

		if (symbolsToUpdate.length === 0) {
			let error = `No user-defined label '${oldLabel}' found.`;
			if (scope) error = `No user-defined label '${oldLabel}' found in scope '${scope}'.`;
			throw new Error(error);
		}

		if (symbolsToUpdate.length > 1) {
			throw new Error(`Multiple labels named '${oldLabel}' found. Please specify a scope.`);
		}

		const symbolToUpdate = symbolsToUpdate[0]!;

		if (!symbolToUpdate.id) {
			throw new Error(`Cannot rename label '${symbolToUpdate.label}' without an ID.`);
		}

		const originalAddress = symbolToUpdate.addr;
		const originalScope = symbolToUpdate.scope;

		await updateSymbol(symbolToUpdate.id, originalAddress, newLabel, namespace, originalScope);

		return `Label '${oldLabel}' at $${formatAddress(originalAddress)} renamed to '${newLabel}'.`;
	},
};
