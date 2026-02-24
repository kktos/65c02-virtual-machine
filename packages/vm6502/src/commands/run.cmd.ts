import type { Command, ParamList } from "@/composables/useCommands";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const run: Command = {
	description: "run the vm at PC or <address>",
	paramDef: ["word?"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const val = params[0];
		if (typeof val === "number") vm.sharedRegisters.setUint16(REG_PC_OFFSET, val, true);
		vm.play();
		return `Run the vm`;
	},
};
