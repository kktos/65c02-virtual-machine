import { useFormatting } from "@/composables/useDataFormattings";
import { useSymbols } from "@/composables/useSymbols";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import { formatAddress, toHex } from "./hex.utils";
import { runHypercall } from "./hypercalls.lib";
import { opcodeMap } from "./opcodes";

const { getFormat } = useFormatting();
const { getSymbolForAddress, getLabelForAddress } = useSymbols();

function findPreviousInstruction(
	readByte: (address: number, debug?: boolean) => number,
	targetAddress: number,
	scope: string,
) {
	if (targetAddress <= 0) return 0;

	// Try to find a synchronization point by looking back.
	// We iterate from a reasonable lookback distance down to 1.
	const maxLookback = 12;

	for (let offset = maxLookback; offset >= 1; offset--) {
		const candidateStart = targetAddress - offset;
		if (candidateStart < 0) continue;

		// Disassemble a small chunk to see if it aligns with targetAddress
		const lines = disassemble(readByte, scope, candidateStart, offset + 4, undefined, 0);

		// If we hit an invalid opcode, this starting point is likely misaligned.
		if (lines.some((line) => line.opc === "???")) continue;

		let prevAddr = -1;

		for (const line of lines) {
			if (line.addr === targetAddress) return prevAddr !== -1 ? prevAddr : candidateStart;
			if (line.addr > targetAddress) break;
			prevAddr = line.addr;
		}
	}

	// Fallback if something goes wrong
	return Math.max(0, targetAddress - 1);
}

export function disassemble(
	readByte: (address: number, debug?: boolean) => number,
	scope: string,
	fromAddress: number,
	lineCount: number,
	registers?: EmulatorState["registers"],
	pivotLineIndex = 0,
) {
	const disassembly: DisassemblyLine[] = [];

	let pc = fromAddress;

	if (pivotLineIndex > 0) {
		for (let i = 0; i < pivotLineIndex; i++) {
			pc = findPreviousInstruction(readByte, pc, scope);
		}
	}

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
				label: "",
				src: "",
				addr: pc,
				faddr: formatAddress(pc),
				mode: "IMP",
				opc: opcode,
				opr: "",
				oprn: 0,
				bytes: rawBytesStr,
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
				label: "",
				src: "",
				addr: address,
				faddr: formatAddress(address),
				mode: "IMP",
				opc: "???",
				opr: "",
				oprn: 0,
				bytes: toHex(opcodeByte, 2),
				comment: "",
				cycles: 1,
			});
			pc++;
			continue;
		}

		const { name, bytes, cycles, mode } = opcodeInfo;

		const symbol = getSymbolForAddress(address, scope);
		const line: DisassemblyLine = {
			label: symbol?.label ?? "",
			src: symbol?.src ?? "",
			addr: address,
			faddr: formatAddress(address),

			mode,
			opc: name,
			opr: "",
			oprn: 0,

			bytes: "",
			comment: "",
			cycles,
		};

		const operandBytes: [number, number] = [readByte(pc + 1), readByte(pc + 2)] as const;

		const actualOperands = operandBytes.slice(0, bytes - 1);
		const allBytes = [opcodeByte, ...actualOperands];
		line.bytes = allBytes.map((b) => toHex(b, 2)).join(" ");

		let effectiveAddress: number | null = null;

		switch (mode) {
			case "IMP":
			case "ACC":
				// No operand to format
				break;
			case "IMM":
				line.opr = `#${toHex(operandBytes[0], 2)}`;
				if (line.opc === "CMP")
					line.comment = `'${String.fromCharCode(operandBytes[0] & 0x7f)}' ${operandBytes[0]}`;
				break;
			case "ZP": {
				effectiveAddress = operandBytes[0] ?? 0;
				const label = getLabelForAddress(effectiveAddress, scope);
				line.opr = label ?? `$${toHex(effectiveAddress, 2)}`;
				line.oprn = effectiveAddress;
				if (!label) effectiveAddress = null;
				break;
			}
			case "ZPX": {
				effectiveAddress = operandBytes[0] ?? 0;
				const label = getLabelForAddress(effectiveAddress, scope);
				line.opr = `${label ?? `$${toHex(effectiveAddress, 2)}`},X`;
				line.oprn = effectiveAddress;
				if (registers) effectiveAddress = (effectiveAddress + registers.X) & 0xff;
				break;
			}
			case "ZPY": {
				effectiveAddress = operandBytes[0] ?? 0;
				const label = getLabelForAddress(effectiveAddress, scope);
				line.opr = `${label ?? `$${toHex(effectiveAddress, 2)}`},Y`;
				line.oprn = effectiveAddress;
				if (registers) effectiveAddress = (effectiveAddress + registers.Y) & 0xff;
				break;
			}
			case "ABS": {
				effectiveAddress = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				const symbol = getSymbolForAddress(effectiveAddress);
				line.comment = symbol?.scope ? `= [${symbol?.scope}]` : "";
				line.opr = symbol?.label ?? `$${toHex(effectiveAddress, 4)}`;
				line.oprn = effectiveAddress;
				if (!symbol) effectiveAddress = null;
				break;
			}
			case "ABX": {
				effectiveAddress = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				const label = getLabelForAddress(effectiveAddress, scope);
				line.opr = `${label ?? `$${toHex(effectiveAddress, 4)}`},X`;
				line.oprn = effectiveAddress;
				if (registers) effectiveAddress = (effectiveAddress + registers.X) & 0xffff;
				break;
			}
			case "ABY": {
				effectiveAddress = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				const label = getLabelForAddress(effectiveAddress, scope);
				line.opr = `${label ?? `$${toHex(effectiveAddress, 4)}`},Y`;
				line.oprn = effectiveAddress;
				if (registers) effectiveAddress = (effectiveAddress + registers.Y) & 0xffff;
				break;
			}
			case "REL": {
				const offset = operandBytes[0] ?? 0;
				effectiveAddress = pc + 2 + (offset < 0x80 ? offset : offset - 0x100);
				const label = getLabelForAddress(effectiveAddress, scope);
				line.opr = `${label ?? `$${toHex(effectiveAddress, 4)}`}`;
				line.oprn = effectiveAddress;
				if (!label) effectiveAddress = null;
				break;
			}
			case "IND": {
				const ind = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				const label = getLabelForAddress(ind, scope);
				line.opr = `(${label ?? `$${toHex(ind, 4)}`})`;
				line.oprn = ind;
				const lo = readByte(ind, false);
				const hi = readByte((ind + 1) & 0xffff, false);
				effectiveAddress = (hi << 8) | lo;
				break;
			}
			case "IAX": {
				// (Absolute, X)
				const iax = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				const label = getLabelForAddress(iax, scope);
				line.opr = `(${label ?? `$${toHex(iax, 4)}`},X)`;
				line.oprn = iax;
				if (registers) {
					const ptr = (iax + registers.X) & 0xffff;
					const lo = readByte(ptr, false);
					const hi = readByte((ptr + 1) & 0xffff, false);
					effectiveAddress = (hi << 8) | lo;
				}
				break;
			}
			case "IDX": {
				// (Zero Page, X)
				const addr = operandBytes[0] ?? 0;
				const label = getLabelForAddress(addr, scope);
				line.opr = `(${label ?? `$${toHex(addr, 2)}`},X)`;
				line.oprn = addr;
				if (registers) {
					const ptr = (operandBytes[0] + registers.X) & 0xff;
					const lo = readByte(ptr, false);
					const hi = readByte((ptr + 1) & 0xffff, false);
					effectiveAddress = (hi << 8) | lo;
				}
				break;
			}
			case "IDY": {
				// (Zero Page), Y
				const addr = operandBytes[0] ?? 0;
				const label = getLabelForAddress(addr, scope);
				line.opr = `(${label ?? `$${toHex(addr, 2)}`}),Y`;
				line.oprn = addr;
				if (registers) {
					const ptr = operandBytes[0];
					const lo = readByte(ptr, false);
					const hi = readByte((ptr + 1) & 0xffff, false);
					const base = (hi << 8) | lo;
					effectiveAddress = (base + registers.Y) & 0xffff;
				}
				break;
			}
			case "ZPI": {
				// (Zero Page)
				const addr = operandBytes[0] ?? 0;
				const label = getLabelForAddress(addr, scope);
				line.opr = `(${label ?? `$${toHex(addr, 2)}`})`;
				line.oprn = addr;
				if (registers) {
					const ptr = operandBytes[0];
					const lo = readByte(ptr, false);
					const hi = readByte((ptr + 1) & 0xffff, false);
					effectiveAddress = (hi << 8) | lo;
				}
				break;
			}
			default:
				line.opr = `${operandBytes.map((b) => toHex(b, 2)).join(" ")}`;
				break;
		}

		if (effectiveAddress !== null) {
			const hexAddr = toHex(effectiveAddress, 4);
			if (line.comment) {
				line.comment += ` $${hexAddr}`;
			} else {
				line.comment = `= $${hexAddr}`;
			}
		}

		disassembly.push(line);
		pc += bytes;
	}

	// console.log("Disassembly:", toHex(fromAddress, 4), lineCount, disassembly);

	return disassembly;
}
