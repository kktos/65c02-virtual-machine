import type { Command, ParamList } from "@/composables/useCommands";
import { useFormatting, type DataType } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

const TYPES = new Set(["byte", "word", "string"]);

export const defData: Command = {
	description: "Define data region of type <string> at <address> with length <word>.",
	paramDef: ["string", "address", "word"],
	fn: async (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const type = params[0] as string;
		if (!TYPES.has(type)) throw new Error("Invalid data type.");

		const address = params[1] as number;
		const length = params[2] as number;

		const { addFormatting } = useFormatting();

		addFormatting(address, type as DataType, length);

		return `Data region set for $${formatAddress(address)}: $${type}[${length}]`;
	},
};
