import { ONE_CHAR_OPS, TokenType, TWO_CHAR_OPS, type Token } from "../expressionParser/expressionParser";

export function miniAssemblerTokenizer(input: string): Token[] {
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

		// Hex number ($...)
		if (char === "$") {
			i++;
			let hex = "";
			while (i < input.length && /[0-9A-Fa-f]/.test(input[i] as string)) {
				hex += input[i];
				i++;
			}
			if (hex.length === 0) throw new Error(`Invalid hex at ${start}`);
			tokens.push({ type: TokenType.INTEGER, value: parseInt(hex, 16), text: `$${hex}`, start, end: i });

			continue;
		}

		// Decimal number
		if (/[0-9]/.test(char)) {
			while (i < input.length) {
				const c = input.charCodeAt(i);
				if (c < 48 || c > 57) break;
				i++;
			}
			const numStr = input.slice(start, i);
			tokens.push({
				type: TokenType.INTEGER,
				value: parseInt(numStr),
				text: numStr,
				start,
				end: i,
			});
			continue;
		}

		// Identifiers (Registers or Labels or Local Labels)
		// /:?[a-zA-Z_]/
		if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 58) {
			if (code === 58) i++;
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
			tokens.push({ type: TokenType.IDENTIFIER, value: 0, text: ident, start, end: i });
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

		throw new Error(`Invalid character "${char}" at pos ${i}`);
	}
	tokens.push({ type: TokenType.EOF, value: 0, text: "", start: i, end: i });

	return tokens;
}
