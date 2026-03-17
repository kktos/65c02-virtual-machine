import { useMachine } from "@/composables/useMachine";
import type { Command } from "@/types/command";

export const reboot: Command = {
	description: "Reboot the vm",
	paramDef: [],
	group: "Execution",
	fn: () => {
		const { loadMachine } = useMachine();
		loadMachine();
		return `Rebooted the vm`;
	},
};
