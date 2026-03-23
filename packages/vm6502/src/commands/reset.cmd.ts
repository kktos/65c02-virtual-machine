import type { CommandContext, CommandDef } from "@/types/command";

export const reset: CommandDef = {
	description: "Reset the vm",
	paramDef: [],
	group: "Execution",
	fn: ({ vm }: CommandContext) => {
		vm.reset();
		return `Reset the vm`;
	},
};
