import { useBreakpoints } from "@/composables/useBreakpoints";
import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { CommandContext, ParamListItem } from "@/types/command";
import { BP_TYPES } from "./enableBP.cmd";

const hookTarget = (params: ParamListItem[]) => {
	const type = (isParamListItemIdentifier(params[0]) ? params[0].text.toLowerCase() : "") as Breakpoint["type"];
	if (!BP_TYPES.has(type))
		throw new Error(`Invalid hook type '${type}'. Must be one of: ${[...BP_TYPES].join(", ")}.`);
	const address = params[1] as number;
	return { type, address, label: `${type.toUpperCase()} @ ${formatAddress(address)}` };
};

export const hook = defineCommand({
	description:
		"Set a command to execute when a breakpoint is hit, then run on.\n" +
		"`once`: turned off on its first hit, before its command runs; it stays listed, for ON to turn back on.\n" +
		"Without a command, turn back on the hook set there (see OFF), once again with `once`.\n" +
		'Usage: ON <\u200btype> <\u200baddress> [once] [do] ["<\u200bcommand>"]',
	paramDef: ["name", "address", "name*", "rest"],
	group: "Breakpoints",
	fn: ({ vm, params }: CommandContext) => {
		const { type, address, label } = hookTarget(params);
		const rest = params.slice(2);
		const keyword = () => (isParamListItemIdentifier(rest[0]) ? rest[0].text.toLowerCase() : undefined);

		const once = keyword() === "once";
		if (once) rest.shift();
		// `do` is optional sugar: `ON pc $300 do "regs"` is `ON pc $300 "regs"`.
		if (keyword() === "do") {
			rest.shift();
			if (rest[0] === undefined) throw new Error("Missing command to execute after `do`.");
		}
		if (isParamListItemIdentifier(rest[0]))
			throw new Error(`Expected ${once ? "" : "`once` or "}\`do\`, got '${rest[0].text}'.`);

		const commandToExecute = rest[0];
		const { addBreakpoint, removeBreakpoint, getBreakpoint, setBreakpointEnabled } = useBreakpoints();
		const set = (command: string, once: boolean) => {
			// A hook is a breakpoint with a command.
			// To update a hook, we remove the old one and add the new one.
			// The key for breakpoints doesn't include the command, so remove works.
			removeBreakpoint({ type, address }, vm);
			addBreakpoint({ type, address, command, ...(once && { once }) }, vm);
		};
		const onceStr = (once: boolean | undefined) => (once ? " (once)" : "");

		if (commandToExecute === undefined) {
			const existing = getBreakpoint({ type, address });
			if (!existing?.command) throw new Error(`No hook on ${label} to turn on: give it a command.`);
			// Without `once`, a once hook stays one.
			if (once && !existing.once) {
				set(existing.command, true);
				return `Hook on ${label} on (once)`;
			}
			const changed = setBreakpointEnabled(existing, true, vm);
			return `Hook on ${label} ${changed ? "on" : "already on"}${onceStr(existing.once)}`;
		}
		if (typeof commandToExecute !== "string") throw new Error("The command to execute must be a quoted string.");

		set(`${commandToExecute};run`, once);
		return `Hook set on ${label}${onceStr(once)}`;
	},
});

export const hookOff = defineCommand({
	description:
		"Turn off the hook set by ON: it no longer fires, but stays listed, with its command. `ON <type> <address>` turns it back on; BC removes it.\n" +
		"Usage: OFF <​type> <​address>",
	paramDef: ["name", "address"],
	group: "Breakpoints",
	fn: ({ vm, params }: CommandContext) => {
		const { type, address, label } = hookTarget(params);
		const { getBreakpoint, setBreakpointEnabled } = useBreakpoints();

		// Not an error, as BC: a script may turn a hook off "just in case".
		const existing = getBreakpoint({ type, address });
		if (!existing?.command) return `No hook on ${label}`;
		return setBreakpointEnabled(existing, false, vm) ? `Hook on ${label} off` : `Hook on ${label} already off`;
	},
});
