import { defineCommand } from "@/composables/useCommands";
import type { CommandContext } from "@/types/command";

export const reset = defineCommand({
	description: "Reset the vm",
	paramDef: [],
	group: "Execution",
	fn: ({ vm }: CommandContext) => {
		vm.reset();
		return `Reset the vm`;
	},
});
