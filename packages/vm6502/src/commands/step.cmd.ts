import { defineCommand } from "@/composables/useCommands";
import type { CommandContext } from "@/types/command";

export const stepCmd = defineCommand({
	description: "Step Instruction",
	group: "Execution",
	fn: ({ vm }: CommandContext) => {
		// const val = params[0];
		// if (typeof val === "number") vm.sharedRegisters.setUint16(REG_PC_OFFSET, val, true);
		vm.step();
		return `One step beyond`;
	},
});
