import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import { opcodeMap } from "./opcodes";

const toHex = (v: number | undefined, pad: number) => (v ?? 0).toString(16).toUpperCase().padStart(pad, "0");

export const disassemble = (memory: Uint8Array, fromAddress: number, toAddress: number): DisassemblyLine[] => {
	const disassembly: DisassemblyLine[] = [];
	if (!memory || memory.length === 0) return disassembly;

	let pc = fromAddress;

	while (pc <= toAddress && pc < memory.length) {
		const address = pc;
		const opcodeByte = memory[pc] ?? 0;
		const opcodeInfo = opcodeMap[opcodeByte];

		// Check for unknown opcode or if the instruction would read beyond memory bounds
		if (!opcodeInfo || pc + opcodeInfo.bytes > memory.length) {
			disassembly.push({
				address,
				opcode: "???",
				rawBytes: toHex(opcodeByte, 2),
				comment: `Unknown opcode`,
				cycles: 1,
			});
			pc++; // Move to the next byte to try and find a valid instruction
			continue;
		}

		const { name, bytes, cycles, mode } = opcodeInfo;
		const line: DisassemblyLine = { address, opcode: name, rawBytes: "", comment: "", cycles };

		const operandBytes: number[] = [];
		for (let i = 1; i < bytes; i++) operandBytes.push(memory[pc + i] ?? 0); // These reads are now guaranteed to be within bounds

		const allBytes = [opcodeByte, ...operandBytes];
		line.rawBytes = allBytes.map((b) => toHex(b, 2)).join(" ");

		switch (mode) {
			case "IMP":
			case "ACC":
				// No operand to format
				break;
			case "IMM":
				line.opcode = `${name} #${toHex(operandBytes[0], 2)}`;
				break;
			case "ZP":
				line.opcode = `${name} $${toHex(operandBytes[0], 2)}`;
				break;
			case "ZPX":
				line.opcode = `${name} $${toHex(operandBytes[0], 2)},X`;
				break;
			case "ZPY":
				line.opcode = `${name} $${toHex(operandBytes[0], 2)},Y`;
				break;
			case "ABS":
				line.opcode = `${name} $${toHex((operandBytes[1] << 8) | operandBytes[0], 4)}`;
				break;
			case "ABX":
				line.opcode = `${name} $${toHex((operandBytes[1] << 8) | operandBytes[0], 4)},X`;
				break;
			case "ABY":
				line.opcode = `${name} $${toHex((operandBytes[1] << 8) | operandBytes[0], 4)},Y`;
				break;
			case "REL": {
				const offset = operandBytes[0];
				const target = pc + 2 + (offset < 0x80 ? offset : offset - 0x100);
				line.opcode = `${name} $${toHex(target, 4)}`;
				break;
			}
			case "IND":
				line.opcode = `${name} ($${toHex((operandBytes[1] << 8) | operandBytes[0], 4)})`;
				break;
			case "IAX": // (Absolute, X)
				line.opcode = `${name} ($${toHex((operandBytes[1] << 8) | operandBytes[0], 4)},X)`;
				break;
			case "IDX": // (Zero Page, X)
				line.opcode = `${name} ($${toHex(operandBytes[0], 2)},X)`;
				break;
			case "IDY": // (Zero Page), Y
				line.opcode = `${name} ($${toHex(operandBytes[0], 2)}),Y`;
				break;
			case "ZPI": // (Zero Page)
				line.opcode = `${name} ($${toHex(operandBytes[0], 2)})`;
				break;
			default:
				line.opcode = `${name} ${operandBytes.map((b) => toHex(b, 2)).join(" ")}`;
				break;
		}

		disassembly.push(line);
		pc += bytes;
	}

	return disassembly;
};
