import { useFormatting } from "@/composables/useFormatting";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import { runHypercall, toHex } from "./hypercalls.lib";
import { opcodeMap } from "./opcodes";

const { getFormat } = useFormatting();

export function disassemble(
	readByte: (address: number, debug?: boolean) => number,
	fromAddress: number,
	lineCount: number,
	registers?: EmulatorState["registers"],
): DisassemblyLine[] {
	const disassembly: DisassemblyLine[] = [];

	let pc = fromAddress;

	while (disassembly.length < lineCount) {
		// Safety check to prevent infinite loops if PC goes out of bounds
		if (pc > 0xffffff) break;

		// Check for Custom Formatting (Data Directives)

		const format = getFormat(pc);
		if (format) {
			let byteCount = format.length;
			if (format.type === "word") byteCount *= 2;

			const bytes: number[] = [];
			for (let i = 0; i < byteCount; i++) bytes.push(readByte(pc + i));

			let opcode = "";
			const comment = "";
			let rawBytesStr = "";

			// Format Raw Bytes (limit to ~8 for display)
			const displayBytes = bytes.slice(0, 8);
			rawBytesStr = displayBytes.map((b) => toHex(b, 2)).join(" ");
			if (bytes.length > 8) rawBytesStr += "...";

			switch (format.type) {
				case "string": {
					const text = bytes
						.map((b) => {
							const c = b & 0x7f;
							return c >= 32 && c <= 126 ? String.fromCharCode(c) : ".";
						})
						.join("");
					opcode = `.STR "${text}"`;
					break;
				}
				case "word": {
					const words: string[] = [];
					for (let i = 0; i < format.length; i++) {
						const lo = bytes[i * 2];
						const hi = bytes[i * 2 + 1];
						if (lo !== undefined && hi !== undefined) {
							const val = (hi << 8) | lo;
							words.push(`$${toHex(val, 4)}`);
						}
					}
					opcode = `.WORD ${words.join(", ")}`;
					break;
				}
				default:
					opcode = `.BYTE ${bytes.map((b) => `$${toHex(b, 2)}`).join(", ")}`;
			}

			disassembly.push({
				address: pc,
				opcode,
				rawBytes: rawBytesStr,
				comment,
				cycles: 0,
			});

			pc += byteCount;
			continue;
		}

		const address = pc;
		const opcodeByte = readByte(pc);

		// Check for Hypercalls
		if (opcodeByte === 0x00) {
			const result = runHypercall(readByte, pc);
			if (result.line) {
				disassembly.push(result.line);
				pc = result.pc;
				continue;
			}
		}

		const opcodeInfo = opcodeMap[opcodeByte];

		// Check for unknown opcode or if the instruction would read beyond memory bounds
		if (!opcodeInfo) {
			disassembly.push({
				address,
				opcode: "???",
				rawBytes: toHex(opcodeByte, 2),
				comment: "",
				cycles: 1,
			});
			pc++;
			continue;
		}

		const { name, bytes, cycles, mode } = opcodeInfo;
		const line: DisassemblyLine = { address, opcode: name, rawBytes: "", comment: "", cycles };

		const operandBytes: [number, number] = [readByte(pc + 1), readByte(pc + 2)] as const;

		const actualOperands = operandBytes.slice(0, bytes - 1);
		const allBytes = [opcodeByte, ...actualOperands];
		line.rawBytes = allBytes.map((b) => toHex(b, 2)).join(" ");

		let effectiveAddress: number | null = null;

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
				if (registers) effectiveAddress = (operandBytes[0] + registers.X) & 0xff;
				break;
			case "ZPY":
				line.opcode = `${name} $${toHex(operandBytes[0], 2)},Y`;
				if (registers) effectiveAddress = (operandBytes[0] + registers.Y) & 0xff;
				break;
			case "ABS":
				line.opcode = `${name} $${toHex(((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0), 4)}`;
				break;
			case "ABX": {
				const absX = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				line.opcode = `${name} $${toHex(absX, 4)},X`;
				if (registers) effectiveAddress = (absX + registers.X) & 0xffff;
				break;
			}
			case "ABY": {
				const absY = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				line.opcode = `${name} $${toHex(absY, 4)},Y`;
				if (registers) effectiveAddress = (absY + registers.Y) & 0xffff;
				break;
			}
			case "REL": {
				const offset = operandBytes[0] ?? 0;
				const target = pc + 2 + (offset < 0x80 ? offset : offset - 0x100);
				line.opcode = `${name} $${toHex(target, 4)}`;
				break;
			}
			case "IND": {
				const ind = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				line.opcode = `${name} ($${toHex(ind, 4)})`;
				if (registers) {
					const lo = readByte(ind, false);
					const hi = readByte((ind + 1) & 0xffff, false);
					effectiveAddress = (hi << 8) | lo;
				}
				break;
			}
			case "IAX": {
				// (Absolute, X)
				const iax = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				line.opcode = `${name} ($${toHex(iax, 4)},X)`;
				if (registers) {
					const ptr = (iax + registers.X) & 0xffff;
					const lo = readByte(ptr, false);
					const hi = readByte((ptr + 1) & 0xffff, false);
					effectiveAddress = (hi << 8) | lo;
				}
				break;
			}
			case "IDX": // (Zero Page, X)
				line.opcode = `${name} ($${toHex(operandBytes[0], 2)},X)`;
				if (registers) {
					const ptr = (operandBytes[0] + registers.X) & 0xff;
					const lo = readByte(ptr, false);
					const hi = readByte((ptr + 1) & 0xffff, false);
					effectiveAddress = (hi << 8) | lo;
				}
				break;
			case "IDY": // (Zero Page), Y
				line.opcode = `${name} ($${toHex(operandBytes[0], 2)}),Y`;
				if (registers) {
					const ptr = operandBytes[0];
					const lo = readByte(ptr, false);
					const hi = readByte((ptr + 1) & 0xffff, false);
					const base = (hi << 8) | lo;
					effectiveAddress = (base + registers.Y) & 0xffff;
				}
				break;
			case "ZPI": // (Zero Page)
				line.opcode = `${name} ($${toHex(operandBytes[0], 2)})`;
				if (registers) {
					const ptr = operandBytes[0];
					const lo = readByte(ptr, false);
					const hi = readByte((ptr + 1) & 0xffff, false);
					effectiveAddress = (hi << 8) | lo;
				}
				break;
			default:
				line.opcode = `${name} ${operandBytes.map((b) => toHex(b, 2)).join(" ")}`;
				break;
		}

		if (effectiveAddress !== null) {
			const hexAddr = toHex(effectiveAddress, 4);
			if (line.comment) {
				line.comment += ` @ $${hexAddr}`;
			} else {
				line.comment = `= $${hexAddr}`;
			}
		}

		disassembly.push(line);
		pc += bytes;
	}

	return disassembly;
}
