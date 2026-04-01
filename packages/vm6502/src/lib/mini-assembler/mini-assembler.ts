import { toHex } from "../hex.utils";
import { type AddressingMode, opcodeMap } from "../opcodes";

// Generate reverse map: Mnemonic -> Mode -> Opcode
const mnemonicMap = new Map<string, Map<AddressingMode, number>>();

for (const [byteStr, info] of Object.entries(opcodeMap)) {
	const byte = parseInt(byteStr, 10);
	const name = info.name.toUpperCase();
	if (!mnemonicMap.has(name)) mnemonicMap.set(name, new Map());
	mnemonicMap.get(name)!.set(info.mode, byte);
}

const BYTE_MODES = new Set(["ZP", "ZPX", "ZPY", "IDX", "IDY", "ZPI"]);
const WORD_MODES = new Set(["ABS", "ABX", "ABY", "IND", "IAX"]);

type AssemblerResult = { pc: number; bytes?: number[] } | string | undefined;

type AssemblerOptions = {
	parseExpression: (expr: string) => number;
	parseExpressions: (expr: string) => (number | string)[];
	defineSymbol: (name: string, value: number, isLocal?: boolean) => void;
};

function assembleLine(
	pc: number,
	text: string,
	{ parseExpression, parseExpressions, defineSymbol }: AssemblerOptions,
): AssemblerResult {
	// Normalize spaces
	let cleanText = text.trim().replace(/\s+/g, " ");
	if (!cleanText) return;

	const bytes: number[] = [];

	// Handle labels (e.g., "LABEL: LDA #$00" or "LABEL:")
	const colonIdx = cleanText.indexOf(":");
	if (colonIdx !== -1) {
		if (colonIdx === 0) {
			const spaceIdx = cleanText.indexOf(" ");
			const potentialLabel = cleanText.substring(0, spaceIdx > 0 ? spaceIdx : undefined).trim();
			if (potentialLabel) defineSymbol(potentialLabel, pc, true);
			cleanText = cleanText.substring(potentialLabel.length + 1).trim();
		} else {
			const potentialLabel = cleanText.substring(0, colonIdx);
			// A valid label should not contain internal spaces
			if (potentialLabel && !potentialLabel.includes(" ")) {
				defineSymbol(potentialLabel, pc);
				cleanText = cleanText.substring(colonIdx + 1).trim();
			}
		}
		if (!cleanText) return;
	}

	const spaceIdx = cleanText.indexOf(" ");
	let mnemonic = (spaceIdx === -1 ? cleanText : cleanText.substring(0, spaceIdx)).toUpperCase();
	const operandStr = spaceIdx === -1 ? "" : cleanText.substring(spaceIdx + 1).trim();

	if (mnemonic.startsWith(".")) {
		const compileString = (str: string) => {
			for (let i = 0; i < str.length; i++) {
				bytes.push(str.charCodeAt(i));
			}
		};

		switch (mnemonic) {
			case ".ORG":
				const pc = parseExpression(operandStr);
				return { pc };
			case ".BYTE":
			case ".DB": {
				const res = parseExpressions(operandStr);
				for (let i = 0; i < res.length; i++) {
					const val = res[i];
					if (typeof val === "string") compileString(val);
					else {
						if (val > 0xff) return `".DB: byte $${toHex(val)} value out of range`;
						bytes.push(val & 0xff);
					}
				}
				return;
			}
			case ".WORD":
			case ".DW": {
				const res = parseExpressions(operandStr);
				for (let i = 0; i < res.length; i++) {
					const val = res[i];
					if (typeof val !== "number") return `".DW: word ${val} is not a number`;
					if (val > 0xffff) return `".DW: word $${toHex(val)} value out of range`;
					bytes.push(val & 0xff);
					bytes.push((val >> 8) & 0xff);
				}
				return;
			}
			case ".STR": {
				const res = parseExpressions(operandStr);
				for (let strIdx = 0; strIdx < res.length; strIdx++) {
					const val = res[strIdx];
					if (typeof val !== "string") return `".STR: value ${val} is not a string`;
					compileString(val);
				}
				return;
			}
			default:
				return `Unknown directive: ${mnemonic}`;
		}
	}

	// Handle suffixes
	let forceMode: "byte" | "word" | null = null;
	if (mnemonic.endsWith(".B")) forceMode = "byte";
	else if (mnemonic.endsWith(".W")) forceMode = "word";
	if (forceMode) mnemonic = mnemonic.slice(0, -2);

	const modes = mnemonicMap.get(mnemonic);
	if (!modes) return `Unknown mnemonic: ${mnemonic}`;

	let mode: AddressingMode = "IMP";
	let value = 0;

	if (!operandStr) {
		if (modes.has("IMP")) mode = "IMP";
		else if (modes.has("ACC")) mode = "ACC";
		else return "Missing operand";
	} else {
		// Operand parsing
		const upperOp = operandStr.toUpperCase();

		if (upperOp === "A" && modes.has("ACC")) {
			mode = "ACC";
		} else if (operandStr.startsWith("#")) {
			mode = "IMM";
			value = parseExpression(operandStr.substring(1));
		} else if (operandStr.startsWith("(")) {
			if (upperOp.endsWith(",X)")) {
				mode = mnemonic === "JMP" ? "IAX" : "IDX";
				value = parseExpression(operandStr.slice(1, -3));
			} else if (upperOp.endsWith("),Y")) {
				mode = "IDY";
				value = parseExpression(operandStr.slice(1, -3));
			} else if (operandStr.endsWith(")")) {
				mode = mnemonic === "JMP" ? "IND" : "ZPI";
				value = parseExpression(operandStr.slice(1, -1));
			} else {
				return `Invalid operand format: ${mnemonic} ${operandStr}`;
			}
		} else if (upperOp.endsWith(",X")) {
			value = parseExpression(operandStr.slice(0, -2));
			if (forceMode === "byte") mode = "ZPX";
			else if (forceMode === "word") mode = "ABX";
			else mode = value <= 0xff ? "ZPX" : "ABX";

			if (!modes.has(mode)) {
				// Try alternative
				if (mode === "ZPX" && modes.has("ABX")) mode = "ABX";
				else if (mode === "ABX" && modes.has("ZPX") && value <= 0xff) mode = "ZPX";
			}
		} else if (upperOp.endsWith(",Y")) {
			value = parseExpression(operandStr.slice(0, -2));
			if (forceMode === "byte") mode = "ZPY";
			else if (forceMode === "word") mode = "ABY";
			else mode = value <= 0xff ? "ZPY" : "ABY";

			if (!modes.has(mode)) {
				if (mode === "ZPY" && modes.has("ABY")) mode = "ABY";
				else if (mode === "ABY" && modes.has("ZPY") && value <= 0xff) mode = "ZPY";
			}
		} else {
			// ABS, ZP, REL
			value = parseExpression(operandStr);
			if (modes.has("REL")) {
				mode = "REL";
			} else {
				if (forceMode === "byte") mode = "ZP";
				else if (forceMode === "word") mode = "ABS";
				else mode = value <= 0xff ? "ZP" : "ABS";

				if (!modes.has(mode)) {
					if (mode === "ZP" && modes.has("ABS")) mode = "ABS";
					else if (mode === "ABS" && modes.has("ZP") && value <= 0xff) mode = "ZP";
				}
			}
		}
	}

	if (Number.isNaN(value)) return `Invalid operand value or symbol: ${mnemonic} ${operandStr}`;

	const opcode = modes.get(mode);
	if (!opcode) return `Mode ${mode} not supported for ${mnemonic}`;

	bytes.push(opcode);

	switch (mode) {
		case "IMM":
			if (value > 0xff && value < -128) return "Immediate value out of range";
			bytes.push(value & 0xff);
			break;
		case "REL":
			const offset = (value & 0xffff) - (pc & 0xffff) - 2;
			if (offset < -128 || offset > 127) return `Branch target out of range (offset ${offset})`;
			bytes.push(offset & 0xff);
			break;
		default:
			if (BYTE_MODES.has(mode)) {
				if (value > 0xff) return "Zero page address out of range";
				bytes.push(value & 0xff);
				break;
			}
			if (WORD_MODES.has(mode)) {
				bytes.push(value & 0xff);
				bytes.push((value >> 8) & 0xff);
				break;
			}
	}

	return { pc: pc, bytes };
}

export function assemble(pc: number, text: string, options: AssemblerOptions): AssemblerResult {
	let result: AssemblerResult | undefined;
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		result = assembleLine(pc, lines[i], options);
		if (typeof result === "string") return result;
	}
	return result;
}
