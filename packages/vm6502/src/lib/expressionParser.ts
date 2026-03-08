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
	NUMBER,
	IDENTIFIER, // Register or Label
	// Operators
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

export class ExpressionParser {
	private tokens: Token[] = [];
	private pos = 0;
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
				this.tokens.push({ type: TokenType.NUMBER, value: parseInt(hex, 16), text: `$${hex}`, start, end: i });
				continue;
			}

			// Decimal number
			if (/[0-9]/.test(char)) {
				let dec = "";
				while (i < input.length && /[0-9]/.test(input[i] as string)) {
					dec += input[i];
					i++;
				}
				this.tokens.push({ type: TokenType.NUMBER, value: parseInt(dec, 10), text: dec, start, end: i });
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
				default:
					break loop;
				// throw new Error(`Unknown character: ${char} at ${i}`);
			}
			i++;
		}
		this.tokens.push({ type: TokenType.EOF, value: 0, text: "", start: i, end: i });
	}

	private peek(): Token {
		return this.tokens[this.pos];
	}

	private consume(): Token {
		return this.tokens[this.pos++];
	}

	private match(type: TokenType): boolean {
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

	public parse(precedence = 0): number {
		let token = this.consume();
		let left = this.nud(token);

		while (precedence < this.getPrecedence(this.peek().type)) {
			token = this.consume();
			left = this.led(token, left);
		}

		return left;
	}

	private nud(token: Token): number {
		switch (token.type) {
			case TokenType.NUMBER:
				return token.value;
			case TokenType.IDENTIFIER:
				return this.resolveIdentifier(token.text);
			case TokenType.MEM_START: {
				const addr = this.parse();
				if (!this.match(TokenType.RBRACKET)) throw new Error("Expected ']'");
				return this.vm.read(addr);
			}
			case TokenType.LPAREN: {
				const val = this.parse();
				if (!this.match(TokenType.RPAREN)) throw new Error("Expected ')'");
				return val;
			}
			case TokenType.MINUS:
				return -this.parse(100);
			case TokenType.PLUS:
				return this.parse(100);
			default:
				throw new Error(`Unexpected token: ${token.text}`);
		}
	}

	private led(token: Token, left: number): number {
		const precedence = this.getPrecedence(token.type);
		const right = this.parse(precedence);

		switch (token.type) {
			case TokenType.PLUS:
				return left + right;
			case TokenType.MINUS:
				return left - right;
			case TokenType.MUL:
				return left * right;
			case TokenType.DIV:
				return Math.floor(left / right);
			case TokenType.AND:
				return left & right;
			case TokenType.OR:
				return left | right;
			case TokenType.XOR:
				return left ^ right;
			case TokenType.BOOL_AND:
				return left && right ? 1 : 0;
			case TokenType.BOOL_OR:
				return left || right ? 1 : 0;
			case TokenType.EQ:
				return left === right ? 1 : 0;
			case TokenType.NEQ:
				return left !== right ? 1 : 0;
			case TokenType.LT:
				return left < right ? 1 : 0;
			case TokenType.GT:
				return left > right ? 1 : 0;
			case TokenType.LTE:
				return left <= right ? 1 : 0;
			case TokenType.GTE:
				return left >= right ? 1 : 0;
			default:
				throw new Error(`Unknown operator: ${token.text}`);
		}
	}

	private resolveIdentifier(name: string): number {
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

		throw new Error(`Unknown identifier: ${name}`);
	}
}
