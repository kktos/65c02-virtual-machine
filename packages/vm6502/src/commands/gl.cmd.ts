import { defineCommand } from "@/composables/useCommands";
import { generateLabels } from "@/lib/disassembler";
import { formatAddress } from "@/lib/hex.utils";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

export const glCmd = defineCommand({
	description:
		"Generate labels for a memory <\u200brange> with optional memory <\u200bscope>\n" +
		"Generates labels for all referenced addresses (J??, B??, LD?, ST?, etc)",
	paramDef: ["range", "name?"],
	group: "Symbols",
	fn: async ({ vm, progress, params }: CommandContext) => {
		const { start: from, end: to } = params[0] as { start: number; end: number };
		const scope = params[1] as ParamListItemIdentifier;

		if (from >= to) throw new Error("'from' address must be less than 'to' address.");

		await generateLabels(
			from,
			scope?.text ?? vm.getScope(from),
			to,
			{ read: (addr) => vm.read(addr), getScope: (addr) => vm.getScope(addr) },
			(p) => {
				progress.value = p;
			},
		);
		return `Labels generated for ${formatAddress(from)}-${formatAddress(to)} ('${scope}')`;
	},
});
