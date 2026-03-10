import type { Command, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const reset: Command = {
	description: "Reset the vm",
	paramDef: [],
	group: "Execution",
	fn: (vm: VirtualMachine, _progress: Ref<number>, _params: ParamList) => {
		vm.reset();
		return `Reset the vm`;
	},
};
