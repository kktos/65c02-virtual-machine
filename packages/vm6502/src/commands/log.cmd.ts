import { defineCommand } from "@/composables/useCommands";
import { useLogWindows } from "@/composables/useLogWindows";
import { toHex } from "@/lib/hex.utils";
import type { CommandContext, ParamListItem, ParamListItemIdentifier } from "@/types/command";

/** An arg as logged: a whole number in hex, like the rest of the debugger ($03, $FA62, $01C030), else as is. */
const formatArg = (arg: ParamListItem) => {
	const value = arg && typeof arg === "object" && "text" in arg ? arg.value : arg;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return String(value);
	return `$${toHex(value, value > 0xffff ? 6 : value > 0xff ? 4 : 2)}`;
};

export const logCmd = defineCommand({
	description:
		"Interact with log windows. Usage: log <name> [open|close|clear] | <args...>. Args can be strings, numbers, or expressions (e.g. A, X+1, mem[PC]); whole numbers are logged in hex.",
	paramDef: ["name", "name?", "rest"],
	paramHelp: "name [command] [args...]",
	group: "Logging",
	fn: ({ params }: CommandContext) => {
		const { open, close, trace, clear } = useLogWindows();
		const name = params[0] as ParamListItemIdentifier;
		const rest = params[1] as ParamListItemIdentifier | undefined;

		if (!name) throw new Error("Log window name is required.");

		if (params.length < 2) {
			open(name.text);
			return `Log window '${name.text}' is active.`;
		}

		if (typeof rest === "object" && "text" in rest) {
			const subcommand = rest.text.toLowerCase();

			if (subcommand === "open") {
				open(name.text);
				return `Log window '${name.text}' opened.`;
			}
			if (subcommand === "close") {
				close(name.text);
				return `Log window '${name.text}' closed.`;
			}
			if (subcommand === "clear") {
				clear(name.text);
				return `Log window '${name.text}' cleared.`;
			}
			// Not a subcommand: a first arg that is a name (a register, a label: `log spk PC`), logged by its value
		}

		const line = params
			.slice(1)
			.map(formatArg)
			.join(" ");
		trace(name.text, line);

		return "";
	},
});
