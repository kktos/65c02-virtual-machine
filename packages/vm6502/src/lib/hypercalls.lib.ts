import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import {
	REG_A_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import { toHex } from "./hex.utils";

/*
 * Hypercalls: `BRK <byte> <args…>`, with byte = [S][cmd: 7 bits].
 * cmd = byte & $7F picks the command; S = byte & $80 asks the machine to stop after the call.
 *
 * Decoding is pure (memory in, data out) so that the CPU worker, which runs the call, and the
 * disassembler, which shows it, use the same code. The main thread only applies the effect
 * (`applyHypercall` in virtualmachine/hypercall.ts).
 */

export const HC_LOG_STRING = 0x01;
export const HC_LOG_REGS = 0x02;
export const HC_ADD_REGION = 0x03;
export const HC_REMOVE_REGIONS = 0x04;
export const HC_STOP = 0x80;

export const HYPERCALL_NAMES: Record<number, string> = {
	[HC_LOG_STRING]: "LOG_STRING",
	[HC_LOG_REGS]: "LOG_REGS",
	[HC_ADD_REGION]: "ADD_REGION",
	[HC_REMOVE_REGIONS]: "REMOVE_REGIONS",
};

/** Is `byte` (the one after a BRK) a hypercall command, with or without the stop bit? */
export const isHypercallByte = (byte: number) => (byte & 0x7f) in HYPERCALL_NAMES;

export type HypercallRegs = { A: number; X: number; Y: number; P: number; SP: number };

type HypercallBase = {
	/** address of the BRK */
	address: number;
	/** bytes taken by the call, BRK included: the CPU resumes at address + length */
	length: number;
	/** stop the machine after the call */
	stop: boolean;
};

export type Hypercall = HypercallBase &
	(
		| { cmd: typeof HC_LOG_STRING; stringAddr: number; message: string }
		/** `regs`: only when decoded with the registers (the CPU running the call) */
		| { cmd: typeof HC_LOG_REGS; regs?: HypercallRegs }
		| { cmd: typeof HC_ADD_REGION; region: { name: string; start: number; size: number; bank: number } }
		| { cmd: typeof HC_REMOVE_REGIONS; names: string[] }
	);

type ReadByte = (address: number) => number;

const MAX_STRING = 256;
const readWord = (readByte: ReadByte, address: number) => readByte(address) | (readByte(address + 1) << 8);

/** Zero-terminated string, high bit stripped (Apple II text) */
function readString(readByte: ReadByte, address: number): string {
	let str = "";
	for (let ptr = address; str.length < MAX_STRING; ptr++) {
		const char = readByte(ptr);
		if (char === 0) break;
		str += String.fromCharCode(char & 0x7f);
	}
	return str;
}

/**
 * LOG_STRING's format string: `%h` prints the next argument byte (taken from `argPtr` on) as 2 hex
 * digits, `%%` a `%`; any other `%x` is printed as is. High bits are ignored, `%` and `h` included.
 */
function formatString(readByte: ReadByte, stringAddr: number, argPtr: number) {
	let message = "";
	let argsConsumed = 0;
	let ptr = stringAddr;
	while (message.length < MAX_STRING) {
		const byte = readByte(ptr++);
		if (byte === 0) break;
		const char = byte & 0x7f;
		if (char !== 0x25) {
			message += String.fromCharCode(char);
			continue;
		}
		const code = String.fromCharCode(readByte(ptr++) & 0x7f);
		if (code === "h") message += toHex(readByte(argPtr + argsConsumed++), 2).toLowerCase();
		else if (code === "%") message += "%";
		else message += `%${code}`;
	}
	return { message, argsConsumed };
}

const readRegs = (registers: DataView): HypercallRegs => ({
	A: registers.getUint8(REG_A_OFFSET),
	X: registers.getUint8(REG_X_OFFSET),
	Y: registers.getUint8(REG_Y_OFFSET),
	P: registers.getUint8(REG_STATUS_OFFSET),
	SP: registers.getUint8(REG_SP_OFFSET),
});

/**
 * Decodes the hypercall whose BRK is at `address`; undefined if the byte after it isn't a hypercall.
 * `registers` (the shared registers view): for commands that need the CPU state; the CPU passes it
 * when it runs the call, the disassembler doesn't.
 */
export function decodeHypercall(readByte: ReadByte, address: number, registers?: DataView): Hypercall | undefined {
	const byte = readByte(address + 1);
	if (!isHypercallByte(byte)) return undefined;
	const stop = (byte & HC_STOP) !== 0;
	const base = { address, stop };

	switch (byte & 0x7f) {
		case HC_LOG_STRING: {
			// BRK cmd <string:word> <arg bytes, one per %h>
			const stringAddr = readWord(readByte, address + 2);
			const { message, argsConsumed } = formatString(readByte, stringAddr, address + 4);
			return { ...base, cmd: HC_LOG_STRING, length: 4 + argsConsumed, stringAddr, message };
		}
		case HC_LOG_REGS:
			// BRK cmd
			return { ...base, cmd: HC_LOG_REGS, length: 2, ...(registers && { regs: readRegs(registers) }) };
		case HC_ADD_REGION: {
			// BRK cmd <start:word> <size:word> <name:word> <bank:word>
			const region = {
				start: readWord(readByte, address + 2),
				size: readWord(readByte, address + 4),
				name: readString(readByte, readWord(readByte, address + 6)),
				bank: readWord(readByte, address + 8),
			};
			return { ...base, cmd: HC_ADD_REGION, length: 10, region };
		}
		case HC_REMOVE_REGIONS: {
			// BRK cmd <count:byte> <name:word> × count
			const count = readByte(address + 2);
			const names = Array.from({ length: count }, (_, i) =>
				readString(readByte, readWord(readByte, address + 3 + i * 2)),
			);
			return { ...base, cmd: HC_REMOVE_REGIONS, length: 3 + count * 2, names };
		}
	}
	return undefined;
}

export const formatRegs = ({ A, X, Y, P, SP }: HypercallRegs) => {
	const h = (v: number) => v.toString(16).padStart(2, "0");
	return `A:${h(A)} X:${h(X)} Y:${h(Y)} P:${h(P)} SP:${h(SP)}`;
};

// ─── Disassembly ──────────────────────────────────────────────────────────────

// Decode `BRK <cmd>` as a hypercall only on machines that run them (set when a machine is loaded),
// so the disassembly matches what the CPU does.
let hypercallsEnabled = false;
export const setHypercallDisassembly = (enabled: boolean) => (hypercallsEnabled = enabled);

const disassemblyInfo = (call: Hypercall) => {
	switch (call.cmd) {
		case HC_LOG_STRING:
			return `String @ $${toHex(call.stringAddr, 4)}`;
		case HC_ADD_REGION:
			return `Start: $${toHex(call.region.start, 4)}, Size: $${toHex(call.region.size, 4)}`;
		case HC_REMOVE_REGIONS:
			return `Count: ${call.names.length} (${call.names.join(", ")})`;
		default:
			return "";
	}
};

/** Disassembly line for a hypercall at `pc`, and the address after it; `line` undefined if none. */
export function runHypercall(readByte: ReadByte, pc: number): { line: DisassemblyLine | undefined; pc: number } {
	const call = hypercallsEnabled ? decodeHypercall(readByte, pc) : undefined;
	if (!call) return { line: undefined, pc };

	const displayBytes = Math.min(call.length, 8);
	const raw = Array.from({ length: displayBytes }, (_, i) => toHex(readByte(pc + i), 2));
	const line: DisassemblyLine = {
		addr: pc,
		opc: `!!${HYPERCALL_NAMES[call.cmd]}`,
		bytes: raw.join(" ") + (call.length > 8 ? " ..." : ""),
		cycles: 7,
		opr: call.stop ? "STOP" : "",
		oprn: 0,
		label: "",
		src: "",
		faddr: "",
		mode: "IMP",
		info: disassemblyInfo(call),
		blockComment: "",
		comment: "",
	};
	return { line, pc: pc + call.length };
}
