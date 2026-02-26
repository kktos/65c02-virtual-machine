import type { Command, ParamList } from "@/composables/useCommands";
import { useEmulatorSpeed } from "@/composables/useEmulatorSpeed";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const speed: Command = {
	description: "Set the Machine speed in MHz.",
	paramDef: ["number"],
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const val = params[0] as number;
		useEmulatorSpeed().targetSpeed.value = val;
		return `Speed to ${val}MHz`;
	},
};
