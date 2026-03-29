import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

export const renLabel = defineCommand({
	description: "Rename a user-defined label. Params: <old_label> <new_label> [scope?]",
	paramDef: ["name|string", "name|string", "name?"],
	group: "Symbols",
	fn: async ({ params }: CommandContext) => {
		const oldLabel = isParamListItemIdentifier(params[0]) ? params[0].text : (params[0] as string);
		const newLabel = isParamListItemIdentifier(params[1]) ? params[1].text : (params[1] as string);
		const scope = params[2] as ParamListItemIdentifier | undefined;
		const namespace = "user";

		const { findSymbols, updateSymbol } = useSymbols();

		const potentialSymbols = findSymbols(oldLabel, namespace).filter(
			(s) => s.label.toUpperCase() === oldLabel.toUpperCase(),
		);

		const symbolsToUpdate = scope ? potentialSymbols.filter((s) => s.scope === scope.text) : potentialSymbols;

		if (symbolsToUpdate.length === 0) {
			let error = `No user-defined label '${oldLabel}' found.`;
			if (scope) error = `No user-defined label '${oldLabel}' found in scope '${scope.text}'.`;
			throw new Error(error);
		}

		if (symbolsToUpdate.length > 1)
			throw new Error(`Multiple labels named '${oldLabel}' found. Please specify a scope.`);

		const symbolToUpdate = symbolsToUpdate[0]!;

		if (!symbolToUpdate.id) throw new Error(`Cannot rename label '${symbolToUpdate.label}' without an ID.`);

		const originalAddress = symbolToUpdate.addr;
		const originalScope = symbolToUpdate.scope;

		await updateSymbol(symbolToUpdate.id, originalAddress, newLabel, namespace, originalScope);

		return `Label '${oldLabel}' at $${formatAddress(originalAddress)} renamed to '${newLabel}'.`;
	},
});
