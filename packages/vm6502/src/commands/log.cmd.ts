import { useLogWindows } from "@/composables/useLogWindows";
import type { Command, CommandContext, ParamListItemIdentifier } from "@/types/command";

export const logCmd: Command = {
	description:
		"Interact with log windows. Usage: log <name> [open|close|clear] | <args...>. Args can be strings, numbers, or expressions (e.g. A, X+1, mem[PC]).",
	paramDef: ["name", "name?", "rest?"],
	group: "Logging",
	fn: ({ params }: CommandContext) => {
		const { open, close, trace, clear } = useLogWindows();
		const name = params[0] as ParamListItemIdentifier;
		const rest = params[1] as ParamListItemIdentifier | undefined;

		if (!name) throw new Error("Log window name is required.");

		if (!rest) {
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
			throw new Error("Unknown subcommand");
		}

		const line = params
			.slice(1)
			.map((arg) => String(arg))
			.join(" ");
		trace(name.text, line);

		return "";
	},
};
