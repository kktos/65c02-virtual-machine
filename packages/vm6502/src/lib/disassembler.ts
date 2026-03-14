import { useFormatting, type DataBlock } from "@/composables/useDataFormattings";
import { useSymbols, type SymbolEntry } from "@/composables/useSymbols";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import { formatAddress, toHex } from "./hex.utils";
import { runHypercall } from "./hypercalls.lib";
import { BRANCH_OPCODES, opcodeMap } from "./opcodes";

type FunctionReadByte = (address: number, debug?: boolean) => number;
type FunctionGetScope = (address: number) => string;

const { getFormat } = useFormatting();
const { getSymbolForAddress, getLabelForAddress, addManySymbols, findSymbolWithOffset } = useSymbols();

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

function handleDataRegion(
	format: DataBlock,
	pc: number,
	disassembly: DisassemblyLine[],
	readByte: FunctionReadByte,
	symbol?: SymbolEntry,
) {
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
		label: symbol?.label ?? "",
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

	return byteCount;
}

export function disassemble(
	readByte: FunctionReadByte,
	scope: string,
	fromAddress: number,
	lineCount: number,
	registers?: EmulatorRegisters,
	pivotLineIndex = 0,
) {
	const disassembly: DisassemblyLine[] = [];

	let pc = fromAddress;

	if (pivotLineIndex > 0) for (let i = 0; i < pivotLineIndex; i++) pc = findPreviousInstruction(readByte, pc, scope);

	while (disassembly.length < lineCount) {
		// Safety check to prevent infinite loops if PC goes out of bounds
		if (pc > 0xffffff) break;

		const symbol = getSymbolForAddress(pc, scope);

		// Check for Custom Formatting (Data Directives)
		const format = getFormat(pc);
		if (format) {
			const byteCount = handleDataRegion(format, pc, disassembly, readByte, symbol);
			pc += byteCount;
			continue;
		}

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
				addr: pc,
				faddr: formatAddress(pc),
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

		const line: DisassemblyLine = {
			label: symbol?.label ?? "",
			src: symbol?.src ?? "",
			addr: pc,
			faddr: formatAddress(pc),

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
				line.oprn = effectiveAddress;
				const match = findSymbolWithOffset(effectiveAddress, scope, 16);
				if (match) {
					if (match.offset === 0) {
						line.opr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						line.opr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					line.opr = `$${toHex(effectiveAddress, 2)}`;
					effectiveAddress = null;
				}
				break;
			}
			case "ZPX": {
				effectiveAddress = operandBytes[0] ?? 0;
				line.oprn = effectiveAddress;
				const match = findSymbolWithOffset(effectiveAddress, scope, 16);
				let baseOpr: string;
				if (match) {
					if (match.offset === 0) {
						baseOpr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						baseOpr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					baseOpr = `$${toHex(effectiveAddress, 2)}`;
				}
				line.opr = `${baseOpr},X`;
				if (registers) effectiveAddress = (effectiveAddress + registers.X) & 0xff;
				break;
			}
			case "ZPY": {
				effectiveAddress = operandBytes[0] ?? 0;
				line.oprn = effectiveAddress;
				const match = findSymbolWithOffset(effectiveAddress, scope, 16);
				let baseOpr: string;
				if (match) {
					if (match.offset === 0) {
						baseOpr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						baseOpr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					baseOpr = `$${toHex(effectiveAddress, 2)}`;
				}
				line.opr = `${baseOpr},Y`;
				if (registers) effectiveAddress = (effectiveAddress + registers.Y) & 0xff;
				break;
			}
			case "ABS": {
				effectiveAddress = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				line.oprn = effectiveAddress;
				const match = findSymbolWithOffset(effectiveAddress, scope, 32);
				if (match) {
					line.comment = match.symbol.scope ? `= [${match.symbol.scope}]` : "";
					if (match.offset === 0) {
						line.opr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						line.opr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					line.comment = "";
					line.opr = `$${toHex(effectiveAddress, 4)}`;
					effectiveAddress = null;
				}
				break;
			}
			case "ABX": {
				effectiveAddress = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				line.oprn = effectiveAddress;
				const match = findSymbolWithOffset(effectiveAddress, scope, 32);
				let baseOpr: string;
				if (match) {
					if (match.offset === 0) {
						baseOpr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						baseOpr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					baseOpr = `$${toHex(effectiveAddress, 4)}`;
				}
				line.opr = `${baseOpr},X`;
				if (registers) effectiveAddress = (effectiveAddress + registers.X) & 0xffff;
				break;
			}
			case "ABY": {
				effectiveAddress = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				line.oprn = effectiveAddress;
				const match = findSymbolWithOffset(effectiveAddress, scope, 32);
				let baseOpr: string;
				if (match) {
					if (match.offset === 0) {
						baseOpr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						baseOpr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					baseOpr = `$${toHex(effectiveAddress, 4)}`;
				}
				line.opr = `${baseOpr},Y`;
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
				line.oprn = ind;
				const match = findSymbolWithOffset(ind, scope, 32);
				let baseOpr: string;
				if (match) {
					if (match.offset === 0) {
						baseOpr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						baseOpr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					baseOpr = `$${toHex(ind, 4)}`;
				}
				line.opr = `(${baseOpr})`;
				const lo = readByte(ind, false);
				const hi = readByte((ind + 1) & 0xffff, false);
				effectiveAddress = (hi << 8) | lo;
				break;
			}
			case "IAX": {
				// (Absolute, X)
				const iax = ((operandBytes[1] ?? 0) << 8) | (operandBytes[0] ?? 0);
				line.oprn = iax;
				const match = findSymbolWithOffset(iax, scope, 32);
				let baseOpr: string;
				if (match) {
					if (match.offset === 0) {
						baseOpr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						baseOpr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					baseOpr = `$${toHex(iax, 4)}`;
				}
				line.opr = `(${baseOpr},X)`;
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
				line.oprn = addr;
				const match = findSymbolWithOffset(addr, scope, 16);
				let baseOpr: string;
				if (match) {
					if (match.offset === 0) {
						baseOpr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						baseOpr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					baseOpr = `$${toHex(addr, 2)}`;
				}
				line.opr = `(${baseOpr},X)`;
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
				line.oprn = addr;
				const match = findSymbolWithOffset(addr, scope, 16);
				let baseOpr: string;
				if (match) {
					if (match.offset === 0) {
						baseOpr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						baseOpr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					baseOpr = `$${toHex(addr, 2)}`;
				}
				line.opr = `(${baseOpr}),Y`;
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
				line.oprn = addr;
				const match = findSymbolWithOffset(addr, scope, 16);
				let baseOpr: string;
				if (match) {
					if (match.offset === 0) {
						baseOpr = match.symbol.label;
					} else {
						const offsetStr = match.offset > 9 ? `+$${toHex(match.offset, 2)}` : `+${match.offset}`;
						baseOpr = `${match.symbol.label}${offsetStr}`;
					}
				} else {
					baseOpr = `$${toHex(addr, 2)}`;
				}
				line.opr = `(${baseOpr})`;
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

	return disassembly;
}

export async function generateLabels(
	fromAddress: number,
	_scope: string,
	toAddress: number,
	vm: { read: FunctionReadByte; getScope: FunctionGetScope },
	onProgress?: (percentage: number) => void,
) {
	let pc = fromAddress;
	const totalSize = toAddress - fromAddress;
	if (totalSize <= 0) return;

	let lastReportedProgress = -1;

	const symbolsToAdd: Omit<SymbolEntry, "id" | "disk" | "src">[] = [];

	while (pc < toAddress) {
		// Check for Custom Formatting (Data Directives)
		const currentProgress = Math.floor(((pc - fromAddress) / totalSize) * 100);
		if (currentProgress > lastReportedProgress) {
			onProgress?.(currentProgress);
			lastReportedProgress = currentProgress;
		}

		const format = getFormat(pc);
		if (format) {
			let len = format.length;
			if (format.type === "word") len *= 2;
			pc += len;
			continue;
		}

		const opcodeByte = vm.read(pc);
		const info = opcodeMap[opcodeByte];

		if (!info) {
			pc++;
			continue;
		}

		let target: number | null = null;
		let labelPrefix: "L" | "D" | null = null;

		// Determine target address and label type based on opcode and mode
		if (BRANCH_OPCODES.has(info.name)) {
			labelPrefix = "L";
			switch (info.mode) {
				case "REL": {
					const offset = vm.read(pc + 1);
					const signedOffset = offset < 0x80 ? offset : offset - 0x100;
					target = (pc + 2 + signedOffset) & 0xffff;
					break;
				}
				case "ABS":
				case "IND": // JMP ($1234) - label the pointer
				case "IAX": {
					// JMP ($1234,X) - label the pointer
					const lo = vm.read(pc + 1);
					const hi = vm.read(pc + 2);
					target = (hi << 8) | lo;
					break;
				}
			}
		} else {
			// Not a branch, so it could be a data reference
			labelPrefix = "D";
			switch (info.mode) {
				case "ABS":
				case "ABX":
				case "ABY": {
					const lo = vm.read(pc + 1);
					const hi = vm.read(pc + 2);
					target = (hi << 8) | lo;
					break;
				}
				case "ZP":
				case "ZPX":
				case "ZPY":
				case "IDX":
				case "IDY":
				case "ZPI": {
					target = vm.read(pc + 1);
					break;
				}
				default: {
					// Not a data reference mode we care about (e.g., IMM, ACC, IMP)
					target = null;
					labelPrefix = null;
					break;
				}
			}
		}

		// If we found a target that needs a label, add it
		if (target !== null) {
			const currentScope = vm.getScope(target);
			if (labelPrefix !== null && !getLabelForAddress(target, [currentScope])) {
				const label =
					labelPrefix === "L"
						? `L${toHex(target, 4)}`
						: `${labelPrefix}${toHex(target, target > 0xff ? 4 : 2)}`;
				symbolsToAdd.push({
					addr: target,
					label,
					ns: "user",
					scope: currentScope,
				});
			}
		}

		pc += info.bytes;
	}

	if (symbolsToAdd.length > 0) await addManySymbols(symbolsToAdd);

	onProgress?.(100);
}

export function disassembleRange(
	readByte: FunctionReadByte,
	scope: string,
	fromAddress: number,
	toAddress: number,
	registers?: EmulatorRegisters,
) {
	const lines: DisassemblyLine[] = [];
	const start = Math.min(fromAddress, toAddress);
	const end = Math.max(fromAddress, toAddress);
	let currentAddr = start;
	while (currentAddr <= end) {
		const chunk = disassemble(readByte, scope, currentAddr, 20, registers, 0);
		if (!chunk || chunk.length === 0) break;

		for (const line of chunk) {
			if (line.addr > end) break;
			lines.push(line);
			// Calculate next address based on byte count
			const byteCount = line.bytes.trim().split(" ").length;
			currentAddr = line.addr + byteCount;
		}
		// If the chunk didn't advance us (shouldn't happen), break to avoid infinite loop
		if (chunk[0]?.addr === currentAddr) break;
	}
	return lines;
}

type FormatDisassemblyOptions = {
	withOrg?: boolean;
	withAddr?: boolean;
	withBytes?: boolean;
	asMarkdown?: boolean;
};
function formatAddr(addr: number) {
	const bank = ((addr >> 16) & 0xff).toString(16).toUpperCase().padStart(2, "0");
	const offset = (addr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
	return `$${bank}/${offset}`;
}
function disasmTextOnly(line: DisassemblyLine, asMarkdown = false) {
	const finalComment = line.comment ? `; ${line.comment}` : "";
	const op = line.opc + (line.opr ? ` ${line.opr}` : "");
	let finalLine = `\t${op.padEnd(20, " ")} ${finalComment}`;
	if (line.label) finalLine = asMarkdown ? `**${line.label}**<br>${finalLine}` : `${line.label}:\n${finalLine}`;
	return finalLine;
}
function disasmWithAddr(line: DisassemblyLine, asMarkdown = false) {
	const finalComment = line.comment ? `; ${line.comment}` : "";
	const op = line.opc + (line.opr ? ` ${line.opr}` : "");
	let finalLine = `${formatAddr(line.addr)}:  ${op.padEnd(20, " ")} ${finalComment}`;
	if (line.label) finalLine = asMarkdown ? `**${line.label}**<br>${finalLine}` : `${line.label}:\n${finalLine}`;
	return finalLine;
}
function disasmWithBytes(line: DisassemblyLine, asMarkdown = false) {
	const finalComment = line.comment ? `; ${line.comment}` : "";
	const op = line.opc + (line.opr ? ` ${line.opr}` : "");
	let finalLine = `${formatAddr(line.addr)}:  ${line.bytes.padEnd(10, " ")} ${op.padEnd(20, " ")} ${finalComment}`;
	if (line.label) finalLine = asMarkdown ? `**${line.label}**<br>${finalLine}` : `${line.label}:\n${finalLine}`;
	return finalLine;
}

export const formatDisassemblyAsText = (
	lines: DisassemblyLine[],
	{ withOrg, withAddr, withBytes, asMarkdown }: FormatDisassemblyOptions = {
		withOrg: true,
		withAddr: false,
		withBytes: false,
		asMarkdown: false,
	},
) => {
	let mapper = withAddr ? (withBytes ? disasmWithBytes : disasmWithAddr) : disasmTextOnly;
	let output = lines.map((line) => mapper(line, asMarkdown)).join("\n");
	return withOrg ? `\t.ORG $${toHex(lines[0]?.addr ?? 0, 4)}\n${output}` : output;
};
