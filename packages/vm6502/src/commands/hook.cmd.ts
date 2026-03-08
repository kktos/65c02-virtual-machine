import { useBreakpoints } from "@/composables/useBreakpoints";
import type { Command, ParamList } from "@/composables/useCommands";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export const hook: Command = {
	description: "Set a command to execute when a breakpoint is hit. Usage: HOOK <type> <address> do <command>",
	paramDef: ["string", "address", "string", "rest"],
	fn: (vm: VirtualMachine, _progress, params: ParamList) => {
		const type = params[0] as Breakpoint["type"];
		const address = params[1] as number;
		const doKeyword = params[2] as string;
		const commandToExecute = params[3] as string;

		if (doKeyword?.toLowerCase() !== "do")
			throw new Error("Invalid HOOK syntax. Expected 'do' keyword after address.");

		if (!commandToExecute) throw new Error("Missing command to execute for HOOK.");

		const validTypes: Breakpoint["type"][] = ["pc", "read", "write", "access"];
		if (!validTypes.includes(type))
			throw new Error(`Invalid hook type '${type}'. Must be one of: ${validTypes.join(", ")}.`);

		const { addBreakpoint, removeBreakpoint } = useBreakpoints();

		// A hook is a breakpoint with a command.
		// To update a hook, we remove the old one and add the new one.
		// The key for breakpoints doesn't include the command, so remove works.
		removeBreakpoint({ type, address }, vm);
		addBreakpoint({ type, address, command: commandToExecute }, vm);

		return `Hook set on ${type.toUpperCase()} @ $${address.toString(16).padStart(4, "0")}`;
	},
};
