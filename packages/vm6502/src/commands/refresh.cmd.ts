import { defineCommand } from "@/composables/useCommands";
import type { CommandContext } from "@/types/command";

export const refreshCmd = defineCommand({
	description: "Refresh the video output",
	paramDef: [],
	group: "Viewers",
	fn: ({ vm }: CommandContext) => {
		vm.refreshVideo();
		return "Video refreshed.";
	},
});
