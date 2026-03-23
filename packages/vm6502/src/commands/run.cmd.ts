import type { CommandContext, CommandDef } from "@/types/command";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";

export const run: CommandDef = {
	description: "Run the vm at PC or <address>",
	paramDef: ["word?"],
	closeOnSuccess: true,
	group: "Execution",
	fn: ({ vm, params }: CommandContext) => {
		const val = params[0];
		if (typeof val === "number") vm.sharedRegisters.setUint16(REG_PC_OFFSET, val, true);
		vm.play();
		return `Run the vm`;
	},
};
