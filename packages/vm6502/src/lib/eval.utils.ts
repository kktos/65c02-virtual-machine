import { ExpressionParser } from "@/lib/expressionParser";
import { formatAddress, toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

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

export const evalExpression = (arg: string, vm: VirtualMachine): string => {
	const parser = new ExpressionParser(arg, vm);
	const value = parser.parse();
	if (typeof value === "string") {
		return value;
	}

	const upperArg = arg.toUpperCase();

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
};

export const parseAndEval = (text: string, vm: VirtualMachine): { result: string; hasError: boolean } => {
	const matches = text.match(/(?:"[^"]*"|[^,]+)/g);
	if (!matches) return { result: text, hasError: false }; // Not a comma-separated list, trace as is.

	let hasError = false;
	const evaluatedArgs = matches.map((arg) => {
		const currentArg = arg.trim();
		if (currentArg.startsWith('"') && currentArg.endsWith('"')) {
			return currentArg.substring(1, currentArg.length - 1);
		}

		try {
			return evalExpression(currentArg, vm);
		} catch (e) {
			hasError = true;
			if (e instanceof Error) {
				return `<Error: ${e.message}>`;
			}
			return `<Unknown error>`;
		}
	});

	return { result: evaluatedArgs.join(" "), hasError };
};
