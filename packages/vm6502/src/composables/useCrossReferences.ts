import { toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export type XrefType = "Branch" | "Call" | "Access";
export type XrefFilter = "BRANCH" | "CALL" | "ACCESS" | "ALL";

export interface XrefResult {
	address: number;
	type: XrefType;
	instruction: string;
}

const BRANCH_OPCODES: Record<number, string> = {
	0x10: "BPL",
	0x30: "BMI",
	0x50: "BVC",
	0x70: "BVS",
	0x90: "BCC",
	0xb0: "BCS",
	0xd0: "BNE",
	0xf0: "BEQ",
	0x80: "BRA", // 65C02
};

const ABS_OPCODES: Record<number, string> = {
	// Jumps/Calls
	0x20: "JSR",
	0x4c: "JMP",
	0x6c: "JMP", // Indirect

	// Loads
	0xad: "LDA",
	0xbd: "LDA",
	0xb9: "LDA",
	0xae: "LDX",
	0xbe: "LDX",
	0xac: "LDY",
	0xbc: "LDY",

	// Stores
	0x8d: "STA",
	0x9d: "STA",
	0x99: "STA",
	0x8e: "STX",
	0x8c: "STY",
	0x9c: "STZ", // 65C02
	0x9e: "STZ", // 65C02

	// Arithmetic / Logical
	0x6d: "ADC",
	0x7d: "ADC",
	0x79: "ADC",
	0xed: "SBC",
	0xfd: "SBC",
	0xf9: "SBC",
	0xcd: "CMP",
	0xdd: "CMP",
	0xd9: "CMP",
	0xec: "CPX",
	0xcc: "CPY",
	0x2d: "AND",
	0x3d: "AND",
	0x39: "AND",
	0x0d: "ORA",
	0x1d: "ORA",
	0x19: "ORA",
	0x4d: "EOR",
	0x5d: "EOR",
	0x59: "EOR",
	0x2c: "BIT",
	0x3c: "BIT", // 65C02
	0x0c: "TSB", // 65C02
	0x1c: "TRB", // 65C02

	// RMW / Shifts
	0x0e: "ASL",
	0x1e: "ASL",
	0x2e: "ROL",
	0x3e: "ROL",
	0x4e: "LSR",
	0x5e: "LSR",
	0x6e: "ROR",
	0x7e: "ROR",
	0xce: "DEC",
	0xde: "DEC",
	0xee: "INC",
	0xfe: "INC",
};

const CALL_OPS = new Set([0x20, 0x4c]);
const ACCESS_OPS = Object.keys(ABS_OPCODES)
	.map(Number)
	.filter((op) => !CALL_OPS.has(op));

export function useCrossReferences() {
	const findReferences = (vm: VirtualMachine, targetAddr: number, filter: XrefFilter = "ALL"): XrefResult[] => {
		const results: XrefResult[] = [];
		const read = (a: number) => vm.readDebug(a) ?? 0;

		// 1. Branches (Relative)
		if (filter === "ALL" || filter === "BRANCH") {
			const start = Math.max(0, targetAddr - 130);
			const end = Math.min(0xffff, targetAddr + 130);

			for (let addr = start; addr <= end; addr++) {
				const opcode = read(addr);
				const mnemonic = BRANCH_OPCODES[opcode];
				if (mnemonic) {
					const offset = read(addr + 1);
					// Convert unsigned byte to signed offset
					const signedOffset = offset > 127 ? offset - 256 : offset;
					// Target = PC + 2 + offset
					const dest = (addr + 2 + signedOffset) & 0xffff;

					if (dest === targetAddr) {
						results.push({
							address: addr,
							type: "Branch",
							instruction: `${mnemonic} $${toHex(dest, 4)}`,
						});
					}
				}
			}
		}

		// 2. Absolute References (Calls & Access)
		if (filter !== "BRANCH") {
			const targetLo = targetAddr & 0xff;
			const targetHi = (targetAddr >> 8) & 0xff;

			const candidates: number[] = [];
			if (filter === "ALL" || filter === "CALL") candidates.push(...CALL_OPS);
			if (filter === "ALL" || filter === "ACCESS") candidates.push(...ACCESS_OPS);

			if (candidates.length > 0) {
				const matches = vm.search([null, targetLo, targetHi], 0, 0xffff, false, [candidates]) || [];
				matches.forEach((m) => {
					const opcode = read(m.address);
					const mnemonic = ABS_OPCODES[opcode];
					if (mnemonic) {
						const type = CALL_OPS.has(opcode) ? "Call" : "Access";
						results.push({
							address: m.address,
							type,
							instruction: `${mnemonic} $${toHex(targetAddr, 4)}`,
						});
					}
				});
			}
		}

		return results.sort((a, b) => a.address - b.address);
	};

	return { findReferences };
}
