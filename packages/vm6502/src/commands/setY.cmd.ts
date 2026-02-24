import type { Command, ParamList } from "@/composables/useCommands";
import { toHex } from "@/lib/hex.utils";
import { REG_Y_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const setY: Command = {
	description: "Set value to Y register",
	paramDef: ["byte"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const val = params[0] as number;
		vm.sharedRegisters.setUint8(REG_Y_OFFSET, val);
		return `Register Y set to $${toHex(val)}`;
	},
};
