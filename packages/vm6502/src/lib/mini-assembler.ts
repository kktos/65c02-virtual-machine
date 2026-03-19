import { type AddressingMode, opcodeMap } from "./opcodes";

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

type AssemblerResult = { bytes: number[]; error?: string };
type AssemblerOptions = {
	parseExpression: (expr: string) => number;
	defineSymbol: (name: string, value: number) => void;
};

function assembleLine(
	pc: number,
	text: string,
	bytes: number[],
	{ parseExpression, defineSymbol }: AssemblerOptions,
): string | undefined {
	// Normalize spaces
	let cleanText = text.trim().replace(/\s+/g, " ");
	if (!cleanText) return;

	// Handle labels (e.g., "LABEL: LDA #$00" or "LABEL:")
	const colonIdx = cleanText.indexOf(":");
	if (colonIdx !== -1) {
		const potentialLabel = cleanText.substring(0, colonIdx).trim();
		// A valid label should not contain internal spaces
		if (potentialLabel && !potentialLabel.includes(" ")) {
			defineSymbol(potentialLabel, pc);
			cleanText = cleanText.substring(colonIdx + 1).trim();
			if (!cleanText) return;
		}
	}

	const spaceIdx = cleanText.indexOf(" ");
	let mnemonic = (spaceIdx === -1 ? cleanText : cleanText.substring(0, spaceIdx)).toUpperCase();
	const operandStr = spaceIdx === -1 ? "" : cleanText.substring(spaceIdx + 1).trim();

	// Handle suffixes
	let forceMode: "byte" | "word" | null = null;
	if (mnemonic.endsWith(".B")) {
		forceMode = "byte";
		mnemonic = mnemonic.slice(0, -2);
	} else if (mnemonic.endsWith(".W")) {
		forceMode = "word";
		mnemonic = mnemonic.slice(0, -2);
	}

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
		} else if (operandStr.startsWith("(") && upperOp.endsWith(",X)")) {
			mode = mnemonic === "JMP" ? "IAX" : "IDX";
			value = parseExpression(operandStr.slice(1, -3));
		} else if (operandStr.startsWith("(") && upperOp.endsWith("),Y")) {
			mode = "IDY";
			value = parseExpression(operandStr.slice(1, -3));
		} else if (operandStr.startsWith("(") && operandStr.endsWith(")")) {
			mode = mnemonic === "JMP" ? "IND" : "ZPI";
			value = parseExpression(operandStr.slice(1, -1));
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

	if (Number.isNaN(value)) return "Invalid operand value or symbol";

	const opcode = modes.get(mode);
	if (!opcode) return `Mode ${mode} not supported for ${mnemonic}`;

	bytes.push(opcode);

	if (mode === "IMM") {
		if (value > 0xff && value < -128) return "Immediate value out of range";
		bytes.push(value & 0xff);
	} else if (BYTE_MODES.has(mode)) {
		if (value > 0xff) return "Zero page address out of range";
		bytes.push(value & 0xff);
	} else if (WORD_MODES.has(mode)) {
		bytes.push(value & 0xff);
		bytes.push((value >> 8) & 0xff);
	} else if (mode === "REL") {
		const offset = value - pc - 2;
		if (offset < -128 || offset > 127) {
			return `Branch target out of range (offset ${offset})`;
		}
		bytes.push(offset & 0xff);
	}

	return;
}

export function assemble(pc: number, text: string, options: AssemblerOptions): AssemblerResult {
	const bytes: number[] = [];
	const lines = text.split(/\r?\n/);
	for (const line of lines) {
		const currentPc = (pc + bytes.length) & 0xffff;
		const error = assembleLine(currentPc, line, bytes, options);
		if (error) return { bytes: [], error };
	}
	return { bytes };
}
