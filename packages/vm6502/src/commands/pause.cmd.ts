import type { Command, CommandContext } from "@/types/command";

export const pause: Command = {
	description: "Pause the vm",
	paramDef: [],
	group: "Execution",
	fn: ({ vm }: CommandContext) => {
		vm.pause();
		return `Pause the vm`;
	},
};
