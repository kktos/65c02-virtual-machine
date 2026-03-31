import { defineCommand } from "@/composables/useCommands";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

export const regsCmd = defineCommand({
	description:
		"Save/Restore current CPU registers (A, X, Y, SP, P, PC) onto/from an internal stack.\n" +
		"Usage: regs <save|restore>",
	group: "Monitor",
	paramDef: ["name"],
	fn: ({ vm, params }: CommandContext) => {
		const cmd = params[0] as ParamListItemIdentifier;
		switch (cmd.text.toLowerCase()) {
			case "save":
				vm.saveRegisters();
				return "Registers saved to internal stack.";
			case "restore":
				vm.restoreRegisters();
				return "Registers restored from internal stack.";
			default:
				throw new Error(`Unknown command: ${cmd.text}`);
		}
	},
});
