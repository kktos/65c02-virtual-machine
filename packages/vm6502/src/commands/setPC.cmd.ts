import type { Command, ParamList } from "@/composables/useCommands";
import { toHex } from "@/lib/hex.utils";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const setPC: Command = {
	description: "Set value to PC register",
	paramDef: ["word"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const val = params[0] as number;
		vm.sharedRegisters.setUint16(REG_PC_OFFSET, val, true);
		return `Register PC set to $${toHex(val, 4)}`;
	},
};
