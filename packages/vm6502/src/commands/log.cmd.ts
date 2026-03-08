import { useLogWindows } from "@/composables/useLogWindows";
import type { Command } from "@/composables/useCommands";

export const logCmd: Command = {
	description: "Interact with log windows. Usage: log <name> [open|close|clear|trace <text...>] | <text...>",
	paramDef: ["string", "rest?"],
	fn: (_vm, _progress, params) => {
		const { open, close, trace, clear } = useLogWindows();
		const name = params[0] as string;
		const rest = params[1] as string | undefined;

		if (!name) throw new Error("Log window name is required.");

		if (!rest) {
			open(name);
			return `Log window '${name}' is active.`;
		}

		const parts = rest.split(/\s+/);
		const subcommand = parts[0]?.toLowerCase();

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
		if (subcommand === "trace") {
			const textToTrace = parts.slice(1).join(" ");
			trace(name, textToTrace);
			return ""; // No success message for every trace to avoid spam
		}

		// If no subcommand matched, treat the whole 'rest' as text to trace.
		trace(name, rest);
		return ""; // No success message for every trace to avoid spam
	},
};
