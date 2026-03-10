import { useMachine } from "@/composables/useMachine";
import type { Command, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const reboot: Command = {
	description: "Reboot the vm",
	paramDef: [],
	group: "Execution",
	fn: (_vm: VirtualMachine, _progress: Ref<number>, _params: ParamList) => {
		const { loadMachine } = useMachine();
		loadMachine();
		return `Rebooted the vm`;
	},
};
