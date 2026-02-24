import type { Command, ParamList } from "@/composables/useCommands";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const pause: Command = {
	description: "run the vm at PC or <address>",
	paramDef: [],
	fn: (vm: VirtualMachine, _progress: Ref<number>, _params: ParamList) => {
		vm.pause();
		return `Pause the vm`;
	},
};
