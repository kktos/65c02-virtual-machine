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

			if (upperArg === "P" || upperArg === "FLAGS") return formatFlags(value);
			if (value < 0) return `${value} ($${toHex(value & 0xffff, 4)})`;
			if (value > 0xffff) return formatAddress(value);
			if (value > 0xff || upperArg === "PC") return `$${toHex(value, 4)}`;
			return `$${toHex(value, 2)}`;
		} catch (e) {
			if (e instanceof Error) {
				throw e;
			}
			throw new Error("Unknown error");
		}
	});

	return evaluatedArgs.join(" ");
};

export const printCmd: Command = {
	description:
		"Prints evaluated expressions to the console. Args can be strings, numbers, or expressions (e.g. A, X+1, mem[PC]).",
	paramDef: ["rest?"],
	fn: (vm, _progress, params) => {
		const rest = params[0] as string | undefined;
		if (!rest) return "";
		return parseAndEval(rest, vm);
	},
};
