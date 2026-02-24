import type { Command, ParamList } from "@/composables/useCommands";
import { toHex } from "@/lib/hex.utils";
import { REG_SP_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const setSP: Command = {
	description: "Set value to Stack Pointer",
	paramDef: ["byte"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const val = params[0] as number;
		vm.sharedRegisters.setUint8(REG_SP_OFFSET, val);
		return `Register SP set to $${toHex(val)}`;
	},
};
