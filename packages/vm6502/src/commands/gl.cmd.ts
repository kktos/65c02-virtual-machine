import { generateLabels } from "@/lib/disassembler";
import { formatAddress } from "@/lib/hex.utils";
import type { Command, ParamList, ParamListItemIdentifier } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const glCmd: Command = {
	description: "Generate labels for a memory `range` with optional memory `scope`",
	paramDef: ["range", "name?"],
	group: "Symbols",
	fn: async (vm: VirtualMachine, progress: Ref<number>, params: ParamList) => {
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
		return `Labels generated for $${formatAddress(from)}-$${formatAddress(to)} ('${scope}')`;
	},
};
