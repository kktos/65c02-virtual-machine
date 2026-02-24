import type { Command, ParamList } from "@/composables/useCommands";
import { generateLabels } from "@/lib/disassembler";
import { toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const gl: Command = {
	description: "Generate labels for a memory range. Params: <from> <to> [scope]",
	paramDef: ["word", "word", "string?"],
	fn: async (vm: VirtualMachine, progress: Ref<number>, params: ParamList) => {
		const from = params[0] as number;
		const to = params[1] as number;
		const scope = (params[2] as string) || vm.getScope(from);

		if (from >= to) throw new Error("'from' address must be less than 'to' address.");

		await generateLabels(
			from,
			scope,
			to,
			{ read: (addr) => vm.read(addr), getScope: (addr) => vm.getScope(addr) },
			(p) => {
				progress.value = p;
			},
		);
		return `Labels generated for $${toHex(from, 4)}-$${toHex(to, 4)} ('${scope}')`;
	},
};
