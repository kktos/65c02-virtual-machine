import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import {
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import { useSymbols } from "@/composables/useSymbols";

export enum TokenType {
	EOF,
	INTEGER,
	FLOAT,
	IDENTIFIER, // Register or Label
	STRING,
	REGEX,
	// Operators
	COMMA,
	PLUS,
	MINUS,
	MUL,
	DIV,
	MOD,
	AND,
	OR,
	XOR, // Bitwise
	BOOL_AND,
	BOOL_OR, // Boolean
	EQ,
	NEQ,
	LT,
	GT,
	LTE,
	GTE,
	ASSIGN,
	LPAREN,
	RPAREN,
	// Special
	COLON,
	AT,
	PIPE,
	SEMICOLON,
	MEM_START, // mem[
	LBRACKET,
	RBRACKET, // ]
	DOT,
	DOUBLE_QUESTION, // ??
	DOUBLE_DASH, // --
	DOUBLE_COLON, // ::
}

const TWO_CHAR_OPS: Record<string, TokenType> = {
	"==": TokenType.EQ,
	"!=": TokenType.NEQ,
	"<=": TokenType.LTE,
	">=": TokenType.GTE,
	"&&": TokenType.BOOL_AND,
	"||": TokenType.BOOL_OR,
	"|>": TokenType.PIPE,
	"??": TokenType.DOUBLE_QUESTION,
	"--": TokenType.DOUBLE_DASH,
	"::": TokenType.DOUBLE_COLON,
};
const ONE_CHAR_OPS: Record<string, TokenType> = {
	"+": TokenType.PLUS,
	"-": TokenType.MINUS,
	"*": TokenType.MUL,
	"/": TokenType.DIV,
	"%": TokenType.MOD,
	"=": TokenType.ASSIGN,
	"&": TokenType.AND,
	"|": TokenType.OR,
	"^": TokenType.XOR,
	"<": TokenType.LT,
	">": TokenType.GT,
	"(": TokenType.LPAREN,
	")": TokenType.RPAREN,
	"[": TokenType.LBRACKET,
	"]": TokenType.RBRACKET,
	",": TokenType.COMMA,
	":": TokenType.COLON,
	"@": TokenType.AT,
	";": TokenType.SEMICOLON,
	".": TokenType.DOT,
};

export interface Token {
	type: TokenType;
	value: number; // For numbers
	text: string; // For identifiers or raw text
	start: number;
	end: number;
}

export interface ParsedResult {
	type: TokenType;
	value: number | string | RegExp | undefined;
	raw: string;
}

type BuiltinFunctionDef = {
	minArgs: number;
	maxArgs: number;
	impl: (args: (string | number | RegExp)[], vm: VirtualMachine, parser: ExpressionParser) => ParsedResult;
};

const BUILTINS: Record<string, BuiltinFunctionDef> = {
	HEX: {
		minArgs: 1,
		maxArgs: 2,
		impl: (args) => {
			const val = args[0];
			if (typeof val !== "number") throw new Error("HEX expects a number as first argument");
			const width = args[1] !== undefined ? Number(args[1]) : 0;
			let str = val.toString(16).toUpperCase();
			if (width > 0) str = str.padStart(width, "0");
			return { type: TokenType.STRING, value: str, raw: str };
		},
	},
	HI: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args) => {
			const val = args[0];
			if (typeof val !== "number") throw new Error("HI expects a number");
			const res = (val >> 8) & 0xff;
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	LO: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args) => {
			const val = args[0];
			if (typeof val !== "number") throw new Error("LO expects a number");
			const res = val & 0xff;
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	PEEK: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args, vm) => {
			const val = args[0];
			if (typeof val !== "number") throw new Error("PEEK expects a number");
			const res = vm.read(val);
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	INT: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args) => {
			const val = args[0];
			if (typeof val !== "number") throw new Error("INT expects a number");
			const res = val | 0;
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	VAL: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args, _vm, parser) => {
			const val = args[0];
			if (typeof val !== "string") throw new Error("VAL expects a symbol name");
			const res = parser.resolveSymbol(val);
			return { type: TokenType.INTEGER, value: res, raw: res?.toString() ?? "" };
		},
	},
	LEN: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args) => {
			const val = args[0];
			if (typeof val !== "string") throw new Error("LEN expects a string");
			const res = val.length;
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	SUBSTR: {
		minArgs: 2,
		maxArgs: 2,
		impl: (args) => {
			const val = args[0];
			const index = args[1];
			if (typeof val !== "string" || typeof index !== "number")
				throw new Error("SUBSTR expects a string and an index");
			const res = val[index];
			return { type: TokenType.STRING, value: res, raw: res };
		},
	},
};

type TokenizeFn = (input: string) => Token[];

export class ExpressionParser {
	private tokenizeFn: TokenizeFn = defaultTokenize;
	private tokens: Token[] = [];
	public pos = 0;

	private vm: VirtualMachine;
	public resolveSymbol: (label: string, namespace?: string) => number | undefined;

	constructor(input: string, vm: VirtualMachine, tokenizeFn?: TokenizeFn) {
		this.vm = vm;

		if (tokenizeFn) this.tokenizeFn = tokenizeFn;
		this.tokens = this.tokenizeFn(input);

		const { getAddressForLabel } = useSymbols();
		this.resolveSymbol = getAddressForLabel;
	}

	public reset(tokens?: Token[]) {
		this.pos = 0;
		if (tokens) this.tokens = tokens;
	}

	public getTokens(from: number = 0): Token[] {
		return this.tokens.slice(from);
	}

	public peek() {
		return this.pos < this.tokens.length
			? this.tokens[this.pos]
			: { type: TokenType.EOF, value: 0, text: "", start: 0, end: 0 };
	}

	public is(type: TokenType): boolean {
		return this.peek().type === type;
	}
	public isIdentifier(text?: string): boolean {
		const peek = this.peek();
		return peek.type === TokenType.IDENTIFIER && (text ? peek.text.toUpperCase() === text : true);
	}

	public eof() {
		return this.peek().type === TokenType.EOF;
	}

	public consume() {
		return this.tokens[this.pos++];
	}

	public match(type: TokenType): boolean {
		if (this.peek().type === type) {
			this.consume();
			return true;
		}
		return false;
	}
	public matchIdentifier(text?: string): boolean {
		if (this.isIdentifier(text)) {
			this.consume();
			return true;
		}
		return false;
	}

	private getPrecedence(type: TokenType): number {
		switch (type) {
			case TokenType.BOOL_OR:
				return 10;
			case TokenType.BOOL_AND:
				return 20;
			case TokenType.OR:
				return 30;
			case TokenType.XOR:
				return 40;
			case TokenType.AND:
				return 50;
			case TokenType.EQ:
			case TokenType.NEQ:
				return 60;
			case TokenType.LT:
			case TokenType.GT:
			case TokenType.LTE:
			case TokenType.GTE:
				return 70;
			case TokenType.PLUS:
			case TokenType.MINUS:
				return 80;
			case TokenType.MUL:
			case TokenType.DIV:
			case TokenType.MOD:
				return 90;
			default:
				return 0;
		}
	}

	public getRestIndex(): number {
		if (this.pos < this.tokens.length) return this.peek().start;
		return 0;
	}

	public parse(precedence = 0): ParsedResult {
		let token = this.consume();
		let left = this.nud(token);
		while (left.value !== undefined && precedence < this.getPrecedence(this.peek().type)) {
			token = this.consume();
			left = this.led(token, left);
		}

		return left;
	}

	private parseBuiltinFunction(name: string): ParsedResult {
		const def = BUILTINS[name];
		if (!def) throw new Error(`Unknown function ${name}`);

		if (!this.match(TokenType.LPAREN)) throw new Error(`Expected '(' after ${name}`);

		const args: (number | string | RegExp)[] = [];
		if (!this.is(TokenType.RPAREN)) {
			do {
				const arg = this.parse();
				if (arg.value === undefined) throw new Error("Argument evaluated to undefined");
				args.push(arg.value);
			} while (this.match(TokenType.COMMA));
		}

		if (!this.match(TokenType.RPAREN)) throw new Error("Expected ')'");

		if (args.length < def.minArgs || args.length > def.maxArgs)
			throw new Error(`${name} expects between ${def.minArgs} and ${def.maxArgs} arguments, got ${args.length}`);

		return def.impl(args, this.vm, this);
	}

	private nud(token: Token): ParsedResult {
		switch (token.type) {
			case TokenType.STRING:
				return { type: TokenType.STRING, value: token.text, raw: token.text };
			case TokenType.REGEX:
				return { type: TokenType.REGEX, value: new RegExp(token.text), raw: token.text };
			case TokenType.INTEGER:
				return { type: TokenType.INTEGER, value: token.value, raw: token.text };
			case TokenType.FLOAT:
				return { type: TokenType.FLOAT, value: token.value, raw: token.text };
			case TokenType.IDENTIFIER: {
				let name = token.text;
				let namespace: string | undefined;
				if (BUILTINS[name.toUpperCase()] && this.is(TokenType.LPAREN))
					return this.parseBuiltinFunction(name.toUpperCase());
				if (this.match(TokenType.DOUBLE_COLON)) {
					namespace = token.text;
					const tok = this.peek();
					if (tok.type !== TokenType.IDENTIFIER) throw new Error("Identifier expected after '::'");
					name = tok.text;
					this.consume();
				}
				return {
					type: TokenType.IDENTIFIER,
					value: this.resolveIdentifier(name, namespace),
					raw: namespace ? `${namespace}::${name}` : name,
				};
			}
			case TokenType.DOUBLE_QUESTION:
				return { type: TokenType.DOUBLE_QUESTION, value: undefined, raw: token.text };
			case TokenType.DOUBLE_DASH:
				const tok = this.peek();
				if (tok.type !== TokenType.IDENTIFIER) throw new Error("Identifier expected after '--'");
				this.consume();
				return { type: TokenType.DOUBLE_DASH, value: undefined, raw: tok.text };
			case TokenType.AT: {
				const tok = this.peek();
				if (tok.type !== TokenType.IDENTIFIER) throw new Error("Identifier expected after '@'");
				this.consume();
				return { type: TokenType.AT, value: undefined, raw: tok.text };
			}
			case TokenType.AND: {
				const tok = this.peek();
				if (tok.type !== TokenType.IDENTIFIER) throw new Error("Identifier expected after '&'");
				// this.consume();
				return { type: TokenType.AND, value: undefined, raw: tok.text };
			}
			case TokenType.MEM_START: {
				const addrRes = this.parse();
				let addr = addrRes.value;
				if (!this.match(TokenType.RBRACKET)) throw new Error("Expected ']'");
				if (typeof addr === "string") addr = this.resolveIdentifier(addr);
				if (typeof addr !== "number") throw new Error("Expected a number for 'mem[]'");
				const value = addr !== undefined ? this.vm.read(addr) : undefined;
				return { type: TokenType.INTEGER, value, raw: token.text };
			}
			case TokenType.LPAREN: {
				const val = this.parse();
				if (!this.match(TokenType.RPAREN)) throw new Error("Expected ')'");
				return val;
			}
			case TokenType.MINUS: {
				const res = this.parse(100);
				if (typeof res.value !== "number") throw new Error("Expected a number after '-'.");
				return { type: res.type, value: -res.value, raw: token.text };
			}
			case TokenType.PLUS:
				return this.parse(100);
			default:
				if (token.type === TokenType.EOF) return { type: TokenType.EOF, value: undefined, raw: token.text };
				throw new Error(`Unexpected token at start of expression: ${token.text}`);
		}
	}

	private led(token: Token, left: ParsedResult): ParsedResult {
		const precedence = this.getPrecedence(token.type);
		const rightRes = this.parse(precedence);

		if (typeof left.value === "string" || typeof rightRes.value === "string") {
			if (typeof left.value === "string") {
				const rightValue = typeof rightRes.value === "string" ? rightRes.value : String(rightRes.value);
				if (token.type === TokenType.EQ)
					return { type: TokenType.INTEGER, value: left.value === rightValue ? 1 : 0, raw: token.text };
				if (token.type === TokenType.NEQ)
					return { type: TokenType.INTEGER, value: left.value !== rightValue ? 1 : 0, raw: token.text };
				if (token.type === TokenType.PLUS)
					return {
						type: TokenType.STRING,
						value: (left.value as string) + rightValue,
						raw: token.text,
					};
			}
			throw new Error(`Operator ${token.text} cannot be applied to strings or mixed types.`);
		}

		if (typeof left.value !== "number")
			throw new Error(`Left-hand side of operator ${token.text} must be a number.`);
		if (typeof rightRes.value !== "number")
			throw new Error(`Right-hand side of operator ${token.text} must be a number.`);

		const leftVal = left.value;
		const rightVal = rightRes.value;

		let resultType =
			left.type === TokenType.FLOAT || rightRes.type === TokenType.FLOAT ? TokenType.FLOAT : TokenType.INTEGER;

		if (token.type === TokenType.DIV) {
			resultType = TokenType.FLOAT;
		} else if (token.type >= TokenType.AND && token.type <= TokenType.GTE) {
			// Bitwise and boolean ops always result in an integer
			resultType = TokenType.INTEGER;
		}

		let resultValue: number;
		switch (token.type) {
			case TokenType.PLUS:
				resultValue = leftVal + rightVal;
				break;
			case TokenType.MINUS:
				resultValue = leftVal - rightVal;
				break;
			case TokenType.MUL:
				resultValue = leftVal * rightVal;
				break;
			case TokenType.DIV:
				resultValue = leftVal / rightVal;
				break;
			case TokenType.MOD:
				resultValue = leftVal % rightVal;
				break;
			case TokenType.AND:
				resultValue = leftVal & rightVal;
				break;
			case TokenType.OR:
				resultValue = leftVal | rightVal;
				break;
			case TokenType.XOR:
				resultValue = leftVal ^ rightVal;
				break;
			case TokenType.BOOL_AND:
				resultValue = leftVal && rightVal ? 1 : 0;
				break;
			case TokenType.BOOL_OR:
				resultValue = leftVal || rightVal ? 1 : 0;
				break;
			case TokenType.EQ:
				resultValue = leftVal === rightVal ? 1 : 0;
				break;
			case TokenType.NEQ:
				resultValue = leftVal !== rightVal ? 1 : 0;
				break;
			case TokenType.LT:
				resultValue = leftVal < rightVal ? 1 : 0;
				break;
			case TokenType.GT:
				resultValue = leftVal > rightVal ? 1 : 0;
				break;
			case TokenType.LTE:
				resultValue = leftVal <= rightVal ? 1 : 0;
				break;
			case TokenType.GTE:
				resultValue = leftVal >= rightVal ? 1 : 0;
				break;
			default:
				throw new Error(`Unknown operator: ${token.text}`);
		}
		return { type: resultType, value: resultValue, raw: token.text };
	}

	private resolveIdentifier(name: string, namespace?: string) {
		const up = name.toUpperCase();
		switch (up) {
			case "A":
				return this.vm.sharedRegisters.getUint8(REG_A_OFFSET);
			case "X":
				return this.vm.sharedRegisters.getUint8(REG_X_OFFSET);
			case "Y":
				return this.vm.sharedRegisters.getUint8(REG_Y_OFFSET);
			case "SP":
				return this.vm.sharedRegisters.getUint8(REG_SP_OFFSET);
			case "PC":
				return this.vm.sharedRegisters.getUint16(REG_PC_OFFSET, true);
			case "P":
			case "FLAGS":
				return this.vm.sharedRegisters.getUint8(REG_STATUS_OFFSET);
		}

		const addr = this.resolveSymbol(name, namespace);
		if (addr !== undefined) return addr;

		return undefined;
		// throw new Error(`Unknown identifier: ${name}`);
	}
}

function defaultTokenize(input: string): Token[] {
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

		// Decimal/Float number
		if (/[0-9]/.test(char) || (char === "." && i + 1 < input.length && /[0-9]/.test(input[i + 1] as string))) {
			while (i < input.length) {
				const c = input.charCodeAt(i);
				if (c < 48 || c > 57) break;
				i++;
			}

			if (i < input.length && input[i] === ".") {
				i++;
				while (i < input.length) {
					const c = input.charCodeAt(i);
					if (c < 48 || c > 57) break;
					i++;
				}
			}

			const numStr = input.slice(start, i);
			const isFloat = numStr.includes(".");
			tokens.push({
				type: isFloat ? TokenType.FLOAT : TokenType.INTEGER,
				value: parseFloat(numStr),
				text: numStr,
				start,
				end: i,
			});
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

		// Regex Literal
		if (char === "/" && i + 1 < input.length && input[i + 1] === "/") {
			const start = i;
			i += 2; // consume opening //
			let pattern = "";
			while (i < input.length) {
				let c = input[i];
				if (c === "/" && i + 1 < input.length && input[i + 1] === "/") break;
				if (c === "\\") {
					pattern += c;
					i++;
					if (i < input.length) c = input[i];
				}
				pattern += c;
				i++;
			}

			if (i >= input.length) throw new Error(`Unterminated regex at ${start}`);
			i += 2; // consume closing //
			tokens.push({ type: TokenType.REGEX, value: 0, text: pattern, start, end: i });
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
