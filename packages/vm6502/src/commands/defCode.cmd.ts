import type { Command, ParamList } from "@/composables/useCommands";
import { useFormatting } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const defCode: Command = {
	description: "Define code region at <address>.",
	paramDef: ["address"],
	fn: async (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;
		const { removeFormat } = useFormatting();
		removeFormat(address);
		return `Data region reset to code for $${formatAddress(address)}`;
	},
};
