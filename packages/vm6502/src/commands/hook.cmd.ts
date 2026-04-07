import { useBreakpoints } from "@/composables/useBreakpoints";
import { defineCommand } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

const validTypes: Set<Breakpoint["type"]> = new Set(["pc", "read", "write", "access"]);

export const hook = defineCommand({
	description:
		"Set a command to execute when a breakpoint is hit.\n" +
		"Usage: HOOK <\u200btype> <\u200baddress> do <\u200bcommand>",
	paramDef: ["name", "address", "rest"],
	group: "Breakpoints",
	fn: ({ vm, params }: CommandContext) => {
		const type = (params[0] as ParamListItemIdentifier).text as Breakpoint["type"];
		const address = params[1] as number;
		const commandToExecute = params[2] as string;

		if (!commandToExecute) throw new Error("Missing command to execute for HOOK.");

		if (!validTypes.has(type))
			throw new Error(`Invalid hook type '${type}'. Must be one of: ${[...validTypes].join(", ")}.`);

		const { addBreakpoint, removeBreakpoint } = useBreakpoints();

		// A hook is a breakpoint with a command.
		// To update a hook, we remove the old one and add the new one.
		// The key for breakpoints doesn't include the command, so remove works.
		removeBreakpoint({ type, address }, vm);
		addBreakpoint({ type, address, command: `${commandToExecute};run` }, vm);

		return `Hook set on ${type.toUpperCase()} @ ${formatAddress(address)}`;
	},
});
