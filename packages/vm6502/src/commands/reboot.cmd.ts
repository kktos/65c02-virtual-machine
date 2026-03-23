import { defineCommand } from "@/composables/useCommands";
import { useMachine } from "@/composables/useMachine";

export const reboot = defineCommand({
	description: "Reboot the vm",
	paramDef: [],
	group: "Execution",
	fn: () => {
		const { loadMachine } = useMachine();
		loadMachine();
		return `Rebooted the vm`;
	},
});
