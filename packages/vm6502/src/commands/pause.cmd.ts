import type { CommandContext, CommandDef } from "@/types/command";

export const pause: CommandDef = {
	description: "Pause the vm",
	paramDef: [],
	group: "Execution",
	fn: ({ vm }: CommandContext) => {
		vm.pause();
		return `Pause the vm`;
	},
};
