import { ONE_CHAR_OPS, TokenType, TWO_CHAR_OPS, type Token } from "../expressionParser/expressionParser";

export function monitorTokenizer(input: string): Token[] {
	const tokens: Token[] = [];

	let i = 0;
	while (i < input.length) {
		const char = input[i] as string;

		if (/\s/.test(char)) {
			i++;
			continue;
		}

		const code = char.charCodeAt(0);

		// Strings
		if (char === '"' || char === "'") {
			const quote = char;
			const start = i;
			i++; // consume opening quote
			let str = "";
			while (i < input.length && input[i] !== quote) {
				let c = input[i] as string;
				if (c === "\\") {
					// escape sequence
					i++;
					if (i >= input.length) throw new Error(`Unterminated escape sequence at ${i}`);
					c = input[i] as string;
					switch (c) {
						case "n":
							str += "\n";
							break;
						case "t":
							str += "\t";
							break;
						case "r":
							str += "\r";
							break;
						case "\\":
							str += "\\";
							break;
						case '"':
							str += '"';
							break;
						case "'":
							str += "'";
							break;
						default:
							str += c; // Keep the character as is if it's an unknown escape
					}
				} else {
					str += c;
				}
				i++;
			}
			if (i >= input.length || input[i] !== quote)
				throw new Error(`Unterminated string literal starting at ${start}`);
			i++; // consume closing quote
			tokens.push({ type: TokenType.STRING, value: 0, text: str, start, end: i });
			continue;
		}

		const start = i;

		// Hex number
		if ((code >= 65 && code <= 70) || (code >= 97 && code <= 102) || (code >= 48 && code <= 57)) {
			while (i < input.length) {
				const c = input.charCodeAt(i);
				if (
					(c >= 65 && c <= 70) || // A-Z
					(c >= 97 && c <= 102) || // a-z
					(c >= 48 && c <= 57) // 0-9
				) {
					i++;
				} else break;
			}
			const hex = input.slice(start, i);
			if (hex.length === 0) throw new Error(`Invalid hex at ${start}`);
			tokens.push({ type: TokenType.INTEGER, value: parseInt(hex, 16), text: `$${hex}`, start, end: i });

			continue;
		}

		// Identifiers (Registers, Labels, or mem)
		// /[a-zA-Z_]/
		if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95) {
			while (i < input.length) {
				const c = input.charCodeAt(i);
				if (
					(c >= 65 && c <= 90) || // A-Z
					(c >= 97 && c <= 122) || // a-z
					(c >= 48 && c <= 57) || // 0-9
					c === 95 // _
				) {
					i++;
				} else break;
			}
			const ident = input.slice(start, i);

			let isMem = false;
			if (ident.toLowerCase() === "mem") {
				// Look ahead for '['
				let j = i;
				// skip whitespace
				while (j < input.length) {
					const c = input.charCodeAt(j);
					if (c === 32 || c === 9 || c === 13 || c === 10) j++;
					else break;
				}

				if (j < input.length && input[j] === "[") {
					i = j + 1; // Skip '['
					tokens.push({ type: TokenType.MEM_START, value: 0, text: "mem[", start, end: i });
					isMem = true;
				}
			}

			if (!isMem) tokens.push({ type: TokenType.IDENTIFIER, value: 0, text: ident, start, end: i });

			continue;
		}

		// Operators
		const twoChar = input.substring(i, i + 2);
		const opType = TWO_CHAR_OPS[twoChar] ?? ONE_CHAR_OPS[char];
		const opLen = TWO_CHAR_OPS[twoChar] !== undefined ? 2 : 1;

		if (opType !== undefined) {
			const text = input.substring(i, i + opLen);
			i += opLen;
			tokens.push({ type: opType, value: 0, text, start, end: i });
			continue;
		}

		throw new Error(`(Monitor) Invalid character "${char}" at pos ${i}`);
	}
	tokens.push({ type: TokenType.EOF, value: 0, text: "", start: i, end: i });

	return tokens;
}
