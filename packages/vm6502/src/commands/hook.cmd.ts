import { useBreakpoints } from "@/composables/useBreakpoints";
import { defineCommand } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

export const hook = defineCommand({
	description: "Set a command to execute when a breakpoint is hit. Usage: HOOK <type> <address> do <command>",
	paramDef: ["name", "address", "rest"],
	group: "Breakpoints",
	fn: ({ vm, params }: CommandContext) => {
		const type = (params[0] as ParamListItemIdentifier).text as Breakpoint["type"];
		const address = params[1] as number;
		const commandToExecute = params[2] as string;

		if (!commandToExecute) throw new Error("Missing command to execute for HOOK.");

		const validTypes: Breakpoint["type"][] = ["pc", "read", "write", "access"];
		if (!validTypes.includes(type))
			throw new Error(`Invalid hook type '${type}'. Must be one of: ${validTypes.join(", ")}.`);

		const { addBreakpoint, removeBreakpoint } = useBreakpoints();

		// A hook is a breakpoint with a command.
		// To update a hook, we remove the old one and add the new one.
		// The key for breakpoints doesn't include the command, so remove works.
		removeBreakpoint({ type, address }, vm);
		addBreakpoint({ type, address, command: `${commandToExecute};run` }, vm);

		return `Hook set on ${type.toUpperCase()} @ ${formatAddress(address)}`;
	},
});
