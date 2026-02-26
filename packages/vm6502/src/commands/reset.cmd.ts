import type { Command, ParamList } from "@/composables/useCommands";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const reset: Command = {
	description: "Reset the vm",
	paramDef: [],
	fn: (vm: VirtualMachine, _progress: Ref<number>, _params: ParamList) => {
		vm.reset();
		return `Reset the vm`;
	},
};
