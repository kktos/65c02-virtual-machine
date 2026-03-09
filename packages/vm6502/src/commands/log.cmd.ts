import { useLogWindows } from "@/composables/useLogWindows";
import type { Command } from "@/composables/useCommands";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { ExpressionParser } from "@/lib/expressionParser";
import { formatAddress, toHex } from "@/lib/hex.utils";

const formatFlags = (p: number): string => {
	const flags = [
		p & 0x80 ? "N" : "n",
		p & 0x40 ? "V" : "v",
		p & 0x20 ? "1" : "0", // unused
		p & 0x10 ? "B" : "b",
		p & 0x08 ? "D" : "d",
		p & 0x04 ? "I" : "i",
		p & 0x02 ? "Z" : "z",
		p & 0x01 ? "C" : "c",
	].join("");
	return `${flags} ($${toHex(p)})`;
};

const parseAndEval = (text: string, vm: VirtualMachine): string => {
	const matches = text.match(/(?:"[^"]*"|[^,]+)/g);
	if (!matches) return text; // Not a comma-separated list, trace as is.

	const evaluatedArgs = matches.map((arg) => {
		const currentArg = arg.trim();
		if (currentArg.startsWith('"') && currentArg.endsWith('"')) {
			return currentArg.substring(1, currentArg.length - 1);
		}

		try {
			const parser = new ExpressionParser(currentArg, vm);
			const value = parser.parse();
			const upperArg = currentArg.toUpperCase();

			if (upperArg === "P" || upperArg === "FLAGS") {
				return formatFlags(value);
			}

			if (value < 0) {
				return `${value} ($${toHex(value & 0xffff, 4)})`;
			}

			if (value > 0xffff) {
				return formatAddress(value);
			}

			if (value > 0xff || upperArg === "PC") {
				return `$${toHex(value, 4)}`;
			}

			return `$${toHex(value, 2)}`;
		} catch (e) {
			if (e instanceof Error) {
				return `<Error: ${e.message}>`;
			}
			return `<Unknown error>`;
		}
	});

	return evaluatedArgs.join(" ");
};

export const logCmd: Command = {
	description:
		"Interact with log windows. Usage: log <name> [open|close|clear] | <args...>. Args can be strings, numbers, or expressions (e.g. A, X+1, mem[PC]).",
	paramDef: ["string", "rest?"],
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
		const textToTrace = parseAndEval(rest, vm);
		trace(name, textToTrace);
		return ""; // No success message for every trace to avoid spam
	},
};
