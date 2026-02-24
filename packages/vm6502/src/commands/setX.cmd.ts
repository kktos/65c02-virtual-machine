import type { Command, ParamList } from "@/composables/useCommands";
import { toHex } from "@/lib/hex.utils";
import { REG_X_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const setX: Command = {
	description: "Set value to X register",
	paramDef: ["byte"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const val = params[0] as number;
		vm.sharedRegisters.setUint8(REG_X_OFFSET, val);
		return `Register X set to $${toHex(val)}`;
	},
};
