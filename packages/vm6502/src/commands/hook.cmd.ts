import { useBreakpoints } from "@/composables/useBreakpoints";
import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { parseUserCommand } from "@/lib/cli-commands.lib";
import { ExpressionParser, TokenType } from "@/lib/expressionParser/expressionParser";
import { formatAddress } from "@/lib/hex.utils";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { CommandContext, ParamListItem } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { BP_TYPES } from "./enableBP.cmd";

const hookTarget = (params: ParamListItem[]) => {
	const type = (isParamListItemIdentifier(params[0]) ? params[0].text.toLowerCase() : "") as Breakpoint["type"];
	if (!BP_TYPES.has(type))
		throw new Error(`Invalid hook type '${type}'. Must be one of: ${[...BP_TYPES].join(", ")}.`);
	const address = params[1] as number;
	return { type, address, label: `${type.toUpperCase()} @ ${formatAddress(address)}` };
};

// What follows the address: [once] [do] [<command> | "<commands>"].
// Unquoted, the command is one command: `;` and `|>` end the ON line before it gets here, as anywhere else.
const parseHookTail = (tail: string | undefined, vm: VirtualMachine) => {
	let text = tail?.trim() ?? "";
	const take = (keyword: string) => {
		const m = text.match(new RegExp(`^${keyword}(?![\\w])\\s*`, "i"));
		if (m) text = text.slice(m[0].length);
		return !!m;
	};
	const once = take("once");
	const hasDo = take("do");
	if (!text) {
		if (hasDo) throw new Error("Missing command to execute after `do`.");
		return { once, command: undefined };
	}

	const tokens = new ExpressionParser(text, vm).getTokens().filter((t) => t.type !== TokenType.EOF);
	if (tokens[0].type === TokenType.STRING) {
		if (tokens.length > 1) throw new Error(`Nothing expected after the quoted command, got '${text.slice(tokens[1].start)}'.`);
		return { once, command: tokens[0].text };
	}

	// Strict `do`: a command, not a bare word, follows it.
	if (!hasDo) throw new Error(`Expected ${once ? "" : "`once` or "}\`do\`, got '${text.split(/\s/)[0]}'.`);
	const parser = new ExpressionParser(text, vm);
	const { isValidCmd } = parseUserCommand(parser);
	if (!isValidCmd && tokens[0].type === TokenType.IDENTIFIER)
		throw new Error(`Unknown command '${tokens[0].text}' (a routine is run with &${tokens[0].text}).`);
	return { once, command: text };
};

export const hook = defineCommand({
	description:
		"Set a command to execute when a breakpoint is hit, then run on.\n" +
		"Unquoted, the command is a single one, ending at `;` or `|>`: quote several commands, or put them in a routine and do &routine.\n" +
		"`once`: turned off on its first hit, before its command runs; it stays listed, for ON to turn back on.\n" +
		"Without a command, turn back on the hook set there (see OFF), once again with `once`.\n" +
		'Usage: ON <\u200btype> <\u200baddress> [once] [do <\u200bcommand> | [do] "<\u200bcommands>"]',
	paramDef: ["name", "address", "raw?"],
	group: "Breakpoints",
	fn: ({ vm, params }: CommandContext) => {
		const { type, address, label } = hookTarget(params);
		const { once, command: commandToExecute } = parseHookTail(params[2] as string | undefined, vm);

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
