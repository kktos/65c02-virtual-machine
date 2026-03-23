import { useMachine } from "@/composables/useMachine";
import type { CommandDef } from "@/types/command";

export const reboot: CommandDef = {
	description: "Reboot the vm",
	paramDef: [],
	group: "Execution",
	fn: () => {
		const { loadMachine } = useMachine();
		loadMachine();
		return `Rebooted the vm`;
	},
};
