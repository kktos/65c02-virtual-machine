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

const ZP_OPCODES: Record<number, string> = {
	// Standard ZP & ZP,X/Y & Indirect
	0x05: "ORA",
	0x15: "ORA",
	0x12: "ORA",
	0x01: "ORA",
	0x11: "ORA",
	0x25: "AND",
	0x35: "AND",
	0x32: "AND",
	0x21: "AND",
	0x31: "AND",
	0x45: "EOR",
	0x55: "EOR",
	0x52: "EOR",
	0x41: "EOR",
	0x51: "EOR",
	0x65: "ADC",
	0x75: "ADC",
	0x72: "ADC",
	0x61: "ADC",
	0x71: "ADC",
	0x85: "STA",
	0x95: "STA",
	0x92: "STA",
	0x81: "STA",
	0x91: "STA",
	0xa5: "LDA",
	0xb5: "LDA",
	0xb2: "LDA",
	0xa1: "LDA",
	0xb1: "LDA",
	0xc5: "CMP",
	0xd5: "CMP",
	0xd2: "CMP",
	0xc1: "CMP",
	0xd1: "CMP",
	0xe5: "SBC",
	0xf5: "SBC",
	0xf2: "SBC",
	0xe1: "SBC",
	0xf1: "SBC",
	0x06: "ASL",
	0x16: "ASL",
	0x26: "ROL",
	0x36: "ROL",
	0x46: "LSR",
	0x56: "LSR",
	0x66: "ROR",
	0x76: "ROR",
	0x86: "STX",
	0x96: "STX",
	0xa6: "LDX",
	0xb6: "LDX",
	0xc6: "DEC",
	0xd6: "DEC",
	0xe6: "INC",
	0xf6: "INC",
	0x24: "BIT",
	0x34: "BIT",
	0x84: "STY",
	0x94: "STY",
	0xa4: "LDY",
	0xb4: "LDY",
	0xc4: "CPY",
	0xe4: "CPX",
	0x04: "TSB",
	0x14: "TRB",
	0x64: "STZ",
	0x74: "STZ",

	// RMB/SMB (65C02)
	0x07: "RMB0",
	0x17: "RMB1",
	0x27: "RMB2",
	0x37: "RMB3",
	0x47: "RMB4",
	0x57: "RMB5",
	0x67: "RMB6",
	0x77: "RMB7",
	0x87: "SMB0",
	0x97: "SMB1",
	0xa7: "SMB2",
	0xb7: "SMB3",
	0xc7: "SMB4",
	0xd7: "SMB5",
	0xe7: "SMB6",
	0xf7: "SMB7",

	// BBR/BBS (65C02)
	0x0f: "BBR0",
	0x1f: "BBR1",
	0x2f: "BBR2",
	0x3f: "BBR3",
	0x4f: "BBR4",
	0x5f: "BBR5",
	0x6f: "BBR6",
	0x7f: "BBR7",
	0x8f: "BBS0",
	0x9f: "BBS1",
	0xaf: "BBS2",
	0xbf: "BBS3",
	0xcf: "BBS4",
	0xdf: "BBS5",
	0xef: "BBS6",
	0xff: "BBS7",
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

		// 3. Zero Page References (Access)
		if (targetAddr < 0x100 && filter !== "BRANCH" && (filter === "ALL" || filter === "ACCESS")) {
			const targetLo = targetAddr & 0xff;
			const candidates = Object.keys(ZP_OPCODES).map(Number);

			// Search for [Opcode, ZP_Addr]
			const matches = vm.search([null, targetLo], 0, 0xffff, false, [candidates]) || [];
			matches.forEach((m) => {
				const opcode = read(m.address);
				const mnemonic = ZP_OPCODES[opcode];
				if (mnemonic) {
					results.push({
						address: m.address,
						type: "Access",
						instruction: `${mnemonic} $${toHex(targetAddr, 2)}`,
					});
				}
			});
		}

		return results.sort((a, b) => a.address - b.address);
	};

	return { findReferences };
}
