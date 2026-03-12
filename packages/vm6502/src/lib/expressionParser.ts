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
	// Operators
	COMMA,
	PLUS,
	MINUS,
	MUL,
	DIV,
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
	LPAREN,
	RPAREN,
	// Special
	COLON,
	MEM_START, // mem[
	RBRACKET, // ]
}

export interface Token {
	type: TokenType;
	value: number; // For numbers
	text: string; // For identifiers or raw text
	start: number;
	end: number;
}

export interface ParsedResult {
	type: TokenType;
	value: number | string | undefined;
	raw: string;
}

export class ExpressionParser {
	private tokens: Token[] = [];
	public pos = 0;
	private vm: VirtualMachine;

	constructor(input: string, vm: VirtualMachine) {
		this.vm = vm;
		this.tokenize(input);
	}

	private tokenize(input: string) {
		let i = 0;
		loop: while (i < input.length) {
			const char = input[i] as string;

			if (/\s/.test(char)) {
				i++;
				continue;
			}

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
				this.tokens.push({ type: TokenType.STRING, value: 0, text: str, start, end: i });
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
				this.tokens.push({ type: TokenType.INTEGER, value: parseInt(hex, 16), text: `$${hex}`, start, end: i });
				continue;
			}

			// Decimal/Float number
			if (/[0-9]/.test(char) || (char === "." && i + 1 < input.length && /[0-9]/.test(input[i + 1] as string))) {
				const start = i;
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
				this.tokens.push({
					type: isFloat ? TokenType.FLOAT : TokenType.INTEGER,
					value: parseFloat(numStr),
					text: numStr,
					start,
					end: i,
				});
				continue;
			}

			// Identifiers (Registers, Labels, or mem)
			if (/[a-zA-Z_]/.test(char)) {
				let ident = "";
				while (i < input.length && /[a-zA-Z0-9_]/.test(input[i] as string)) {
					ident += input[i];
					i++;
				}

				let isMem = false;
				if (ident.toLowerCase() === "mem") {
					// Look ahead for '['
					let j = i;
					while (j < input.length && /\s/.test(input[j] as string)) j++;
					if (j < input.length && input[j] === "[") {
						i = j + 1; // Skip '['
						this.tokens.push({ type: TokenType.MEM_START, value: 0, text: "mem[", start, end: i });
						isMem = true;
					}
				}

				if (!isMem) {
					this.tokens.push({ type: TokenType.IDENTIFIER, value: 0, text: ident, start, end: i });
				}
				continue;
			}

			// Operators
			const twoChar = input.substr(i, 2);
			if (twoChar === "==") {
				this.tokens.push({ type: TokenType.EQ, value: 0, text: "==", start, end: i + 2 });
				i += 2;
				continue;
			}
			if (twoChar === "!=") {
				this.tokens.push({ type: TokenType.NEQ, value: 0, text: "!=", start, end: i + 2 });
				i += 2;
				continue;
			}
			if (twoChar === "<=") {
				this.tokens.push({ type: TokenType.LTE, value: 0, text: "<=", start, end: i + 2 });
				i += 2;
				continue;
			}
			if (twoChar === ">=") {
				this.tokens.push({ type: TokenType.GTE, value: 0, text: ">=", start, end: i + 2 });
				i += 2;
				continue;
			}
			if (twoChar === "&&") {
				this.tokens.push({ type: TokenType.BOOL_AND, value: 0, text: "&&", start, end: i + 2 });
				i += 2;
				continue;
			}
			if (twoChar === "||") {
				this.tokens.push({ type: TokenType.BOOL_OR, value: 0, text: "||", start, end: i + 2 });
				i += 2;
				continue;
			}

			// Single char ops
			switch (char) {
				case "+":
					this.tokens.push({ type: TokenType.PLUS, value: 0, text: "+", start, end: i + 1 });
					break;
				case "-":
					this.tokens.push({ type: TokenType.MINUS, value: 0, text: "-", start, end: i + 1 });
					break;
				case "*":
					this.tokens.push({ type: TokenType.MUL, value: 0, text: "*", start, end: i + 1 });
					break;
				case "/":
					this.tokens.push({ type: TokenType.DIV, value: 0, text: "/", start, end: i + 1 });
					break;
				case "&":
					this.tokens.push({ type: TokenType.AND, value: 0, text: "&", start, end: i + 1 });
					break;
				case "|":
					this.tokens.push({ type: TokenType.OR, value: 0, text: "|", start, end: i + 1 });
					break;
				case "^":
					this.tokens.push({ type: TokenType.XOR, value: 0, text: "^", start, end: i + 1 });
					break;
				case "<":
					this.tokens.push({ type: TokenType.LT, value: 0, text: "<", start, end: i + 1 });
					break;
				case ">":
					this.tokens.push({ type: TokenType.GT, value: 0, text: ">", start, end: i + 1 });
					break;
				case "(":
					this.tokens.push({ type: TokenType.LPAREN, value: 0, text: "(", start, end: i + 1 });
					break;
				case ")":
					this.tokens.push({ type: TokenType.RPAREN, value: 0, text: ")", start, end: i + 1 });
					break;
				case "]":
					this.tokens.push({ type: TokenType.RBRACKET, value: 0, text: "]", start, end: i + 1 });
					break;
				case ",":
					this.tokens.push({ type: TokenType.COMMA, value: 0, text: ",", start, end: i + 1 });
					break;
				case ":":
					this.tokens.push({ type: TokenType.COLON, value: 0, text: ":", start, end: i + 1 });
					break;
				default:
					break loop;
			}
			i++;
		}
		this.tokens.push({ type: TokenType.EOF, value: 0, text: "", start: i, end: i });
	}

	public peek() {
		return this.tokens[this.pos];
	}

	public eof() {
		return this.tokens[this.pos].type === TokenType.EOF;
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
			if (typeof left.value === "string")
				throw new Error(`Operator ${this.peek().text} cannot be applied to a string.`);

			token = this.consume();
			left = this.led(token, left);
		}

		return left;
	}

	private nud(token: Token): ParsedResult {
		switch (token.type) {
			case TokenType.STRING:
				return { type: TokenType.STRING, value: token.text, raw: token.text };
			case TokenType.INTEGER:
				return { type: TokenType.INTEGER, value: token.value, raw: token.text };
			case TokenType.FLOAT:
				return { type: TokenType.FLOAT, value: token.value, raw: token.text };
			case TokenType.IDENTIFIER:
				return { type: TokenType.IDENTIFIER, value: this.resolveIdentifier(token.text), raw: token.text };
			case TokenType.MEM_START: {
				const addrRes = this.parse();
				let addr = addrRes.value;
				if (!this.match(TokenType.RBRACKET)) throw new Error("Expected ']'");
				if (typeof addr === "string") addr = this.resolveIdentifier(addr);
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

	private resolveIdentifier(name: string) {
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

		const { getAddressForLabel } = useSymbols();
		const addr = getAddressForLabel(name);
		if (addr !== undefined) return addr;

		return undefined;
		// throw new Error(`Unknown identifier: ${name}`);
	}
}
