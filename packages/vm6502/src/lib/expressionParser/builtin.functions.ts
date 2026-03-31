import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { type ExpressionParser, type ParsedResult, TokenType } from "./expressionParser";
import { toHex } from "../hex.utils";
import {
	REG_A_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
	REG_SP_OFFSET,
	REG_PC_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";

export type BuiltinFunctionArg =
	| { type: "string"; value: string }
	| { type: "number"; value: number }
	| { type: "identifier"; value: string }
	| { type: "regex"; value: RegExp };

type BuiltinFunctionDef = {
	minArgs: number;
	maxArgs: number;
	impl: (args: BuiltinFunctionArg[], vm: VirtualMachine, parser: ExpressionParser) => ParsedResult;
};

export const BUILTINS: Record<string, BuiltinFunctionDef> = {
	HEX: {
		minArgs: 1,
		maxArgs: 2,
		impl: (args) => {
			const val = args[0];
			if (val.type !== "number") throw new Error("HEX expects a number as first argument");
			const width = args[1] !== undefined ? Number(args[1]) : 0;
			let str = toHex(val.value, width);
			return { type: TokenType.STRING, value: str, raw: str };
		},
	},
	HI: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args) => {
			const val = args[0];
			if (val.type !== "number") throw new Error("HI expects a number");
			const res = (val.value >> 8) & 0xff;
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	LO: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args) => {
			const val = args[0];
			if (val.type !== "number") throw new Error("LO expects a number");
			const res = val.value & 0xff;
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	PEEK: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args, vm) => {
			const val = args[0];
			if (val.type !== "number") throw new Error("PEEK expects a number");
			const res = vm.read(val.value);
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	INT: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args) => {
			const val = args[0];
			if (val.type !== "number") throw new Error("INT expects a number");
			const res = val.value | 0;
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	VAL: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args, _vm, parser) => {
			const val = args[0];
			if (val.type !== "string") throw new Error("VAL expects a symbol name");
			const res = parser.resolveSymbol(val.value);
			return { type: TokenType.INTEGER, value: res, raw: res?.toString() ?? "" };
		},
	},
	LEN: {
		minArgs: 1,
		maxArgs: 1,
		impl: (args) => {
			const val = args[0];
			if (val.type !== "string") throw new Error("LEN expects a string");
			const res = String(val.value).length;
			return { type: TokenType.INTEGER, value: res, raw: res.toString() };
		},
	},
	SUBSTR: {
		minArgs: 2,
		maxArgs: 2,
		impl: (args) => {
			const val = args[0];
			const index = args[1];
			if (val.type !== "string" || index.type !== "number")
				throw new Error("SUBSTR expects a string and an index");
			const res = val.value[index.value];
			return { type: TokenType.STRING, value: res, raw: res };
		},
	},
	INC: {
		minArgs: 1,
		maxArgs: 2,
		impl: (args, vm) => {
			const val = args[0];
			if (val.type !== "identifier") throw new Error("INC expects an identifier");
			const reg = val.value.toUpperCase();
			const registers = vm.sharedRegisters;
			let result: number;
			let inc = 1;
			if (args.length > 1) {
				if (args[1].type !== "number") throw new Error("INC expects a number for increment");
				inc = args[1].value;
			}
			switch (reg) {
				case "A":
					result = (inc + registers.getUint8(REG_A_OFFSET)) & 0xff;
					registers.setUint8(REG_A_OFFSET, result);
					break;
				case "X":
					result = (inc + registers.getUint8(REG_X_OFFSET)) & 0xff;
					registers.setUint8(REG_X_OFFSET, result);
					break;
				case "Y":
					result = (inc + registers.getUint8(REG_Y_OFFSET)) & 0xff;
					registers.setUint8(REG_Y_OFFSET, result);
					break;
				case "SP":
					result = (inc + registers.getUint8(REG_SP_OFFSET)) & 0xff;
					registers.setUint8(REG_SP_OFFSET, result);
					break;
				case "PC":
					result = (inc + registers.getUint16(REG_PC_OFFSET, true)) & 0xffff;
					registers.setUint16(REG_PC_OFFSET, result, true);
					break;
				default:
					throw new Error(`Unknown register ${reg}`);
			}
			return { type: TokenType.INTEGER, value: result, raw: "" };
		},
	},
};
