import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { Command, ParamList, ParamListItemIdentifier } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const renLabel: Command = {
	description: "Rename a user-defined label. Params: <old_label> <new_label> [scope?]",
	paramDef: ["name", "name", "name?"],
	group: "Symbols",
	fn: async (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const oldLabel = params[0] as ParamListItemIdentifier;
		const newLabel = params[1] as ParamListItemIdentifier;
		const scope = params[2] as ParamListItemIdentifier | undefined;
		const namespace = "user";

		const { findSymbols, updateSymbol } = useSymbols();

		const potentialSymbols = findSymbols(oldLabel.text, namespace).filter(
			(s) => s.label.toUpperCase() === oldLabel.text.toUpperCase(),
		);

		const symbolsToUpdate = scope ? potentialSymbols.filter((s) => s.scope === scope.text) : potentialSymbols;

		if (symbolsToUpdate.length === 0) {
			let error = `No user-defined label '${oldLabel.text}' found.`;
			if (scope) error = `No user-defined label '${oldLabel.text}' found in scope '${scope.text}'.`;
			throw new Error(error);
		}

		if (symbolsToUpdate.length > 1)
			throw new Error(`Multiple labels named '${oldLabel.text}' found. Please specify a scope.`);

		const symbolToUpdate = symbolsToUpdate[0]!;

		if (!symbolToUpdate.id) throw new Error(`Cannot rename label '${symbolToUpdate.label}' without an ID.`);

		const originalAddress = symbolToUpdate.addr;
		const originalScope = symbolToUpdate.scope;

		await updateSymbol(symbolToUpdate.id, originalAddress, newLabel.text, namespace, originalScope);

		return `Label '${oldLabel.text}' at $${formatAddress(originalAddress)} renamed to '${newLabel.text}'.`;
	},
};
