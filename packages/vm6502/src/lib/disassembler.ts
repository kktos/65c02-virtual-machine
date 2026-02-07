import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import { opcodeMap } from "./opcodes";

const toHex = (v: number | undefined, pad: number) => (v ?? 0).toString(16).toUpperCase().padStart(pad, "0");

function getHypercallArgs(memory: Uint8Array, stringAddr: number): number {
	let args = 0;
	let ptr = stringAddr;
	let limit = 256;
	while (limit-- > 0 && ptr < memory.length) {
		const char = memory[ptr] ?? 0;
		ptr++;
		if (char === 0) break;
		if (char === 0x25) {
			// '%'
			if (ptr < memory.length) {
				const fmt = memory[ptr] ?? 0;
				ptr++;
				if (fmt === 0x68) args++; // 'h'
			}
		}
	}
	return args;
}

function readString(memory: Uint8Array, address: number): string {
	let str = "";
	let ptr = address;
	let limit = 256;
	while (limit-- > 0 && ptr < memory.length) {
		const char = memory[ptr] ?? 0;
		if (char === 0) break;
		str += String.fromCharCode(char & 0x7f);
		ptr++;
	}
	return str;
}

export function disassemble(
	memory: Uint8Array,
	fromAddress: number,
	lineCount: number,
	registers?: EmulatorState["registers"],
): DisassemblyLine[] {
	const disassembly: DisassemblyLine[] = [];
	if (!memory || memory.length === 0) return disassembly;

	let pc = fromAddress;

	while (disassembly.length < lineCount && pc < memory.length) {
		const address = pc;
		const opcodeByte = memory[pc] ?? 0;

		// Check for Hypercalls
		if (opcodeByte === 0x00 && pc + 1 < memory.length) {
			const cmd = memory[pc + 1] ?? 0;
			let hypercallLine: DisassemblyLine | null = null;
			let bytesConsumed = 0;

			switch (cmd) {
				case 0x01: {
					// LOG_STRING
					if (pc + 4 <= memory.length) {
						const strAddr = (memory[pc + 2] ?? 0) | ((memory[pc + 3] ?? 0) << 8);
						const args = getHypercallArgs(memory, strAddr);
						bytesConsumed = 4 + args;
						hypercallLine = {
							address,
							opcode: "!!LOG_STRING",
							rawBytes: "",
							comment: `String @ $${toHex(strAddr, 4)}`,
							cycles: 7,
						};
					}
					break;
				}
				case 0x02: {
					// LOG_REGS
					bytesConsumed = 2;
					hypercallLine = {
						address,
						opcode: "!!LOG_REGS",
						rawBytes: "",
						comment: "",
						cycles: 7,
					};
					break;
				}
				case 0x03: {
					// ADD_REGION
					if (pc + 10 <= memory.length) {
						bytesConsumed = 10;
						const start = (memory[pc + 2] ?? 0) | ((memory[pc + 3] ?? 0) << 8);
						const size = (memory[pc + 4] ?? 0) | ((memory[pc + 5] ?? 0) << 8);
						hypercallLine = {
							address,
							opcode: "!!ADD_REGION",
							rawBytes: "",
							comment: `Start: $${toHex(start, 4)}, Size: $${toHex(size, 4)}`,
							cycles: 7,
						};
					}
					break;
				}
				case 0x04: {
					// REMOVE_REGIONS
					if (pc + 3 <= memory.length) {
						const count = memory[pc + 2] ?? 0;
						bytesConsumed = 3 + count * 2;
						if (pc + bytesConsumed <= memory.length) {
							const names: string[] = [];
							for (let i = 0; i < count; i++) {
								const ptrAddr = pc + 3 + i * 2;
								const namePtr = (memory[ptrAddr] ?? 0) | ((memory[ptrAddr + 1] ?? 0) << 8);
								names.push(readString(memory, namePtr));
							}
							hypercallLine = {
								address,
								opcode: "!!REMOVE_REGIONS",
								rawBytes: "",
								comment: `Count: ${count} (${names.join(", ")})`,
								cycles: 7,
							};
						}
					}
					break;
				}
			}

			if (hypercallLine) {
				const raw = [];
				const displayBytes = Math.min(bytesConsumed, 8);
				for (let i = 0; i < displayBytes; i++) raw.push(memory[pc + i] ?? 0);
				hypercallLine.rawBytes = raw.map((b) => toHex(b, 2)).join(" ") + (bytesConsumed > 8 ? " ..." : "");
				disassembly.push(hypercallLine);
				pc += bytesConsumed;
				continue;
			}
		}

		const opcodeInfo = opcodeMap[opcodeByte];

		// Check for unknown opcode or if the instruction would read beyond memory bounds
		if (!opcodeInfo || pc + opcodeInfo.bytes > memory.length) {
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

		const operandBytes: [number, number] = [memory[pc + 1] ?? 0, memory[pc + 2] ?? 0] as const;
		// for (let i = 1; i < bytes; i++) operandBytes.push(memory[pc + i] ?? 0); // These reads are now guaranteed to be within bounds

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
					const lo = memory[ind] ?? 0;
					const hi = memory[(ind + 1) & 0xffff] ?? 0;
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
					const lo = memory[ptr] ?? 0;
					const hi = memory[(ptr + 1) & 0xffff] ?? 0;
					effectiveAddress = (hi << 8) | lo;
				}
				break;
			}
			case "IDX": // (Zero Page, X)
				line.opcode = `${name} ($${toHex(operandBytes[0], 2)},X)`;
				if (registers) {
					const ptr = (operandBytes[0] + registers.X) & 0xff;
					const lo = memory[ptr] ?? 0;
					const hi = memory[(ptr + 1) & 0xff] ?? 0;
					effectiveAddress = (hi << 8) | lo;
				}
				break;
			case "IDY": // (Zero Page), Y
				line.opcode = `${name} ($${toHex(operandBytes[0], 2)}),Y`;
				if (registers) {
					const ptr = operandBytes[0];
					const lo = memory[ptr] ?? 0;
					const hi = memory[(ptr + 1) & 0xff] ?? 0;
					const base = (hi << 8) | lo;
					effectiveAddress = (base + registers.Y) & 0xffff;
				}
				break;
			case "ZPI": // (Zero Page)
				line.opcode = `${name} ($${toHex(operandBytes[0], 2)})`;
				if (registers) {
					const ptr = operandBytes[0];
					const lo = memory[ptr] ?? 0;
					const hi = memory[(ptr + 1) & 0xff] ?? 0;
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
