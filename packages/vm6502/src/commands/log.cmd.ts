import { useLogWindows } from "@/composables/useLogWindows";
import { parseAndEval } from "@/lib/eval.utils";
import type { Command } from "@/types/command";

export const logCmd: Command = {
	description:
		"Interact with log windows. Usage: log <name> [open|close|clear] | <args...>. Args can be strings, numbers, or expressions (e.g. A, X+1, mem[PC]).",
	paramDef: ["name", "rest?"],
	group: "Logging",
	fn: (vm, _progress, params) => {
		const { open, close, trace, clear } = useLogWindows();
		const name = params[0] as string;
		const rest = params[1] as string | undefined;

		if (!name) throw new Error("Log window name is required.");

		if (!rest) {
			open(name);
			return `Log window '${name}' is active.`;
		}

		const subcommand = rest.split(/\s+/)[0]?.toLowerCase();

		if (subcommand === "open") {
			open(name);
			return `Log window '${name}' opened.`;
		}
		if (subcommand === "close") {
			close(name);
			return `Log window '${name}' closed.`;
		}
		if (subcommand === "clear") {
			clear(name);
			return `Log window '${name}' cleared.`;
		}

		// If no subcommand matched, treat the whole 'rest' as text to trace.
		const { result, hasError } = parseAndEval(rest, vm);
		trace(name, result, hasError ? "text-red-400" : undefined);
		return ""; // No success message for every trace to avoid spam
	},
};
