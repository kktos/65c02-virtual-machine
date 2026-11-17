import { defineCommand } from "@/composables/useCommands";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

/** P's I flag (interrupts disabled). */
export const FLAG_I = 0x04;

export const regsCmd = defineCommand({
	description:
		"Save/Restore current CPU registers (A, X, Y, SP, P, PC) onto/from an internal stack.\n" +
		"`return` restores them too, except the I flag, which stays as it is: after a routine called with G " +
		"(an install routine's CLI or SEI holds, as after the Monitor's G).\n" +
		"Usage: regs <save|restore|return>",
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
			case "return":
				vm.restoreRegisters(FLAG_I);
				return "Registers restored from internal stack, the I flag kept.";
			default:
				throw new Error(`Unknown command: ${cmd.text}`);
		}
	},
});
