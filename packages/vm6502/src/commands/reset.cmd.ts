import type { Command, CommandContext } from "@/types/command";

export const reset: Command = {
	description: "Reset the vm",
	paramDef: [],
	group: "Execution",
	fn: ({ vm }: CommandContext) => {
		vm.reset();
		return `Reset the vm`;
	},
};
