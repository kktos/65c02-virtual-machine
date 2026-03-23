import { defineCommand } from "@/composables/useCommands";
import type { CommandContext } from "@/types/command";

export const pause = defineCommand({
	description: "Pause the vm",
	paramDef: [],
	group: "Execution",
	fn: ({ vm }: CommandContext) => {
		vm.pause();
		return `Pause the vm`;
	},
});
