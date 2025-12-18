// biome-ignore-all lint/complexity/useSimpleNumberKeys: easier to read here

export interface Opcode {
	name: string;
	bytes: number;
	cycles: number;
	mode: AddressingMode;
}

export type AddressingMode =
	| "IMP"
	| "ACC"
	| "IMM"
	| "ZP"
	| "ZPX"
	| "ZPY"
	| "REL"
	| "ABS"
	| "ABX"
	| "ABY"
	| "IND"
	| "IDX"
	| "IDY"
	| "ZPI"
	| "IAX";

export const opcodeMap: { [key: number]: Opcode } = {
	0x00: { name: "BRK", bytes: 1, cycles: 7, mode: "IMP" },
	0x01: { name: "ORA", bytes: 2, cycles: 6, mode: "IDX" },
	0x02: { name: "COP", bytes: 1, cycles: 7, mode: "IMP" }, // 65C02
	0x04: { name: "TSB", bytes: 2, cycles: 5, mode: "ZP" }, // 65C02
	0x05: { name: "ORA", bytes: 2, cycles: 3, mode: "ZP" },
	0x06: { name: "ASL", bytes: 2, cycles: 5, mode: "ZP" },
	0x08: { name: "PHP", bytes: 1, cycles: 3, mode: "IMP" },
	0x09: { name: "ORA", bytes: 2, cycles: 2, mode: "IMM" },
	0x0a: { name: "ASL", bytes: 1, cycles: 2, mode: "ACC" },
	0x0c: { name: "TSB", bytes: 3, cycles: 6, mode: "ABS" }, // 65C02
	0x0d: { name: "ORA", bytes: 3, cycles: 4, mode: "ABS" },
	0x0e: { name: "ASL", bytes: 3, cycles: 6, mode: "ABS" },

	0x10: { name: "BPL", bytes: 2, cycles: 2, mode: "REL" },
	0x11: { name: "ORA", bytes: 2, cycles: 5, mode: "IDY" },
	0x12: { name: "ORA", bytes: 2, cycles: 5, mode: "ZPI" }, // 65C02
	0x14: { name: "TRB", bytes: 2, cycles: 5, mode: "ZP" }, // 65C02
	0x15: { name: "ORA", bytes: 2, cycles: 4, mode: "ZPX" },
	0x16: { name: "ASL", bytes: 2, cycles: 6, mode: "ZPX" },
	0x18: { name: "CLC", bytes: 1, cycles: 2, mode: "IMP" },
	0x19: { name: "ORA", bytes: 3, cycles: 4, mode: "ABY" },
	0x1a: { name: "INC", bytes: 1, cycles: 2, mode: "ACC" }, // 65C02
	0x1c: { name: "TRB", bytes: 3, cycles: 6, mode: "ABS" }, // 65C02
	0x1d: { name: "ORA", bytes: 3, cycles: 4, mode: "ABX" },
	0x1e: { name: "ASL", bytes: 3, cycles: 7, mode: "ABX" },

	0x20: { name: "JSR", bytes: 3, cycles: 6, mode: "ABS" },
	0x21: { name: "AND", bytes: 2, cycles: 6, mode: "IDX" },
	0x24: { name: "BIT", bytes: 2, cycles: 3, mode: "ZP" },
	0x25: { name: "AND", bytes: 2, cycles: 3, mode: "ZP" },
	0x26: { name: "ROL", bytes: 2, cycles: 5, mode: "ZP" },
	0x28: { name: "PLP", bytes: 1, cycles: 4, mode: "IMP" },
	0x29: { name: "AND", bytes: 2, cycles: 2, mode: "IMM" },
	0x2a: { name: "ROL", bytes: 1, cycles: 2, mode: "ACC" },
	0x2c: { name: "BIT", bytes: 3, cycles: 4, mode: "ABS" },
	0x2d: { name: "AND", bytes: 3, cycles: 4, mode: "ABS" },
	0x2e: { name: "ROL", bytes: 3, cycles: 6, mode: "ABS" },

	0x30: { name: "BMI", bytes: 2, cycles: 2, mode: "REL" },
	0x31: { name: "AND", bytes: 2, cycles: 5, mode: "IDY" },
	0x32: { name: "AND", bytes: 2, cycles: 5, mode: "ZPI" }, // 65C02
	0x34: { name: "BIT", bytes: 2, cycles: 4, mode: "ZPX" }, // 65C02
	0x35: { name: "AND", bytes: 2, cycles: 4, mode: "ZPX" },
	0x36: { name: "ROL", bytes: 2, cycles: 6, mode: "ZPX" },
	0x38: { name: "SEC", bytes: 1, cycles: 2, mode: "IMP" },
	0x39: { name: "AND", bytes: 3, cycles: 4, mode: "ABY" },
	0x3a: { name: "DEC", bytes: 1, cycles: 2, mode: "ACC" }, // 65C02
	0x3c: { name: "BIT", bytes: 3, cycles: 4, mode: "ABX" }, // 65C02
	0x3d: { name: "AND", bytes: 3, cycles: 4, mode: "ABX" },
	0x3e: { name: "ROL", bytes: 3, cycles: 7, mode: "ABX" },

	0x40: { name: "RTI", bytes: 1, cycles: 6, mode: "IMP" },
	0x41: { name: "EOR", bytes: 2, cycles: 6, mode: "IDX" },
	0x45: { name: "EOR", bytes: 2, cycles: 3, mode: "ZP" },
	0x46: { name: "LSR", bytes: 2, cycles: 5, mode: "ZP" },
	0x48: { name: "PHA", bytes: 1, cycles: 3, mode: "IMP" },
	0x49: { name: "EOR", bytes: 2, cycles: 2, mode: "IMM" },
	0x4a: { name: "LSR", bytes: 1, cycles: 2, mode: "ACC" },
	0x4c: { name: "JMP", bytes: 3, cycles: 3, mode: "ABS" },
	0x4d: { name: "EOR", bytes: 3, cycles: 4, mode: "ABS" },
	0x4e: { name: "LSR", bytes: 3, cycles: 6, mode: "ABS" },

	0x50: { name: "BVC", bytes: 2, cycles: 2, mode: "REL" },
	0x51: { name: "EOR", bytes: 2, cycles: 5, mode: "IDY" },
	0x52: { name: "EOR", bytes: 2, cycles: 5, mode: "ZPI" }, // 65C02
	0x55: { name: "EOR", bytes: 2, cycles: 4, mode: "ZPX" },
	0x56: { name: "LSR", bytes: 2, cycles: 6, mode: "ZPX" },
	0x58: { name: "CLI", bytes: 1, cycles: 2, mode: "IMP" },
	0x59: { name: "EOR", bytes: 3, cycles: 4, mode: "ABY" },
	0x5a: { name: "PHY", bytes: 1, cycles: 3, mode: "IMP" }, // 65C02
	0x5d: { name: "EOR", bytes: 3, cycles: 4, mode: "ABX" },
	0x5e: { name: "LSR", bytes: 3, cycles: 7, mode: "ABX" },

	0x60: { name: "RTS", bytes: 1, cycles: 6, mode: "IMP" },
	0x61: { name: "ADC", bytes: 2, cycles: 6, mode: "IDX" },
	0x64: { name: "STZ", bytes: 2, cycles: 3, mode: "ZP" }, // 65C02
	0x65: { name: "ADC", bytes: 2, cycles: 3, mode: "ZP" },
	0x66: { name: "ROR", bytes: 2, cycles: 5, mode: "ZP" },
	0x68: { name: "PLA", bytes: 1, cycles: 4, mode: "IMP" },
	0x69: { name: "ADC", bytes: 2, cycles: 2, mode: "IMM" },
	0x6a: { name: "ROR", bytes: 1, cycles: 2, mode: "ACC" },
	0x6c: { name: "JMP", bytes: 3, cycles: 6, mode: "IND" }, // 65C02 has bug fix, cycles=6
	0x6d: { name: "ADC", bytes: 3, cycles: 4, mode: "ABS" },
	0x6e: { name: "ROR", bytes: 3, cycles: 6, mode: "ABS" },

	0x70: { name: "BVS", bytes: 2, cycles: 2, mode: "REL" },
	0x71: { name: "ADC", bytes: 2, cycles: 5, mode: "IDY" },
	0x72: { name: "ADC", bytes: 2, cycles: 5, mode: "ZPI" }, // 65C02
	0x74: { name: "STZ", bytes: 2, cycles: 4, mode: "ZPX" }, // 65C02
	0x75: { name: "ADC", bytes: 2, cycles: 4, mode: "ZPX" },
	0x76: { name: "ROR", bytes: 2, cycles: 6, mode: "ZPX" },
	0x78: { name: "SEI", bytes: 1, cycles: 2, mode: "IMP" },
	0x79: { name: "ADC", bytes: 3, cycles: 4, mode: "ABY" },
	0x7a: { name: "PLY", bytes: 1, cycles: 4, mode: "IMP" }, // 65C02
	0x7c: { name: "JMP", bytes: 3, cycles: 6, mode: "IAX" }, // 65C02
	0x7d: { name: "ADC", bytes: 3, cycles: 4, mode: "ABX" },
	0x7e: { name: "ROR", bytes: 3, cycles: 7, mode: "ABX" },

	0x80: { name: "BRA", bytes: 2, cycles: 3, mode: "REL" }, // 65C02
	0x81: { name: "STA", bytes: 2, cycles: 6, mode: "IDX" },
	0x84: { name: "STY", bytes: 2, cycles: 3, mode: "ZP" },
	0x85: { name: "STA", bytes: 2, cycles: 3, mode: "ZP" },
	0x86: { name: "STX", bytes: 2, cycles: 3, mode: "ZP" },
	0x88: { name: "DEY", bytes: 1, cycles: 2, mode: "IMP" },
	0x89: { name: "BIT", bytes: 2, cycles: 2, mode: "IMM" }, // 65C02
	0x8a: { name: "TXA", bytes: 1, cycles: 2, mode: "IMP" },
	0x8c: { name: "STY", bytes: 3, cycles: 4, mode: "ABS" },
	0x8d: { name: "STA", bytes: 3, cycles: 4, mode: "ABS" },
	0x8e: { name: "STX", bytes: 3, cycles: 4, mode: "ABS" },

	0x90: { name: "BCC", bytes: 2, cycles: 2, mode: "REL" },
	0x91: { name: "STA", bytes: 2, cycles: 6, mode: "IDY" },
	0x92: { name: "STA", bytes: 2, cycles: 5, mode: "ZPI" }, // 65C02
	0x94: { name: "STY", bytes: 2, cycles: 4, mode: "ZPX" },
	0x95: { name: "STA", bytes: 2, cycles: 4, mode: "ZPX" },
	0x96: { name: "STX", bytes: 2, cycles: 4, mode: "ZPY" },
	0x98: { name: "TYA", bytes: 1, cycles: 2, mode: "IMP" },
	0x99: { name: "STA", bytes: 3, cycles: 5, mode: "ABY" },
	0x9a: { name: "TXS", bytes: 1, cycles: 2, mode: "IMP" },
	0x9c: { name: "STZ", bytes: 3, cycles: 4, mode: "ABS" }, // 65C02
	0x9d: { name: "STA", bytes: 3, cycles: 5, mode: "ABX" },
	0x9e: { name: "STZ", bytes: 3, cycles: 5, mode: "ABX" }, // 65C02

	0xa0: { name: "LDY", bytes: 2, cycles: 2, mode: "IMM" },
	0xa1: { name: "LDA", bytes: 2, cycles: 6, mode: "IDX" },
	0xa2: { name: "LDX", bytes: 2, cycles: 2, mode: "IMM" },
	0xa4: { name: "LDY", bytes: 2, cycles: 3, mode: "ZP" },
	0xa5: { name: "LDA", bytes: 2, cycles: 3, mode: "ZP" },
	0xa6: { name: "LDX", bytes: 2, cycles: 3, mode: "ZP" },
	0xa8: { name: "TAY", bytes: 1, cycles: 2, mode: "IMP" },
	0xa9: { name: "LDA", bytes: 2, cycles: 2, mode: "IMM" },
	0xaa: { name: "TAX", bytes: 1, cycles: 2, mode: "IMP" },
	0xac: { name: "LDY", bytes: 3, cycles: 4, mode: "ABS" },
	0xad: { name: "LDA", bytes: 3, cycles: 4, mode: "ABS" },
	0xae: { name: "LDX", bytes: 3, cycles: 4, mode: "ABS" },

	0xb0: { name: "BCS", bytes: 2, cycles: 2, mode: "REL" },
	0xb1: { name: "LDA", bytes: 2, cycles: 5, mode: "IDY" },
	0xb2: { name: "LDA", bytes: 2, cycles: 5, mode: "ZPI" }, // 65C02
	0xb4: { name: "LDY", bytes: 2, cycles: 4, mode: "ZPX" },
	0xb5: { name: "LDA", bytes: 2, cycles: 4, mode: "ZPX" },
	0xb6: { name: "LDX", bytes: 2, cycles: 4, mode: "ZPY" },
	0xb8: { name: "CLV", bytes: 1, cycles: 2, mode: "IMP" },
	0xb9: { name: "LDA", bytes: 3, cycles: 4, mode: "ABY" },
	0xba: { name: "TSX", bytes: 1, cycles: 2, mode: "IMP" },
	0xbc: { name: "LDY", bytes: 3, cycles: 4, mode: "ABX" },
	0xbd: { name: "LDA", bytes: 3, cycles: 4, mode: "ABX" },
	0xbe: { name: "LDX", bytes: 3, cycles: 4, mode: "ABY" },

	0xc0: { name: "CPY", bytes: 2, cycles: 2, mode: "IMM" },
	0xc1: { name: "CMP", bytes: 2, cycles: 6, mode: "IDX" },
	0xc4: { name: "CPY", bytes: 2, cycles: 3, mode: "ZP" },
	0xc5: { name: "CMP", bytes: 2, cycles: 3, mode: "ZP" },
	0xc6: { name: "DEC", bytes: 2, cycles: 5, mode: "ZP" },
	0xc8: { name: "INY", bytes: 1, cycles: 2, mode: "IMP" },
	0xc9: { name: "CMP", bytes: 2, cycles: 2, mode: "IMM" },
	0xca: { name: "DEX", bytes: 1, cycles: 2, mode: "IMP" },
	0xcc: { name: "CPY", bytes: 3, cycles: 4, mode: "ABS" },
	0xcd: { name: "CMP", bytes: 3, cycles: 4, mode: "ABS" },
	0xce: { name: "DEC", bytes: 3, cycles: 6, mode: "ABS" },

	0xd0: { name: "BNE", bytes: 2, cycles: 2, mode: "REL" },
	0xd1: { name: "CMP", bytes: 2, cycles: 5, mode: "IDY" },
	0xd2: { name: "CMP", bytes: 2, cycles: 5, mode: "ZPI" }, // 65C02
	0xd5: { name: "CMP", bytes: 2, cycles: 4, mode: "ZPX" },
	0xd6: { name: "DEC", bytes: 2, cycles: 6, mode: "ZPX" },
	0xd8: { name: "CLD", bytes: 1, cycles: 2, mode: "IMP" },
	0xd9: { name: "CMP", bytes: 3, cycles: 4, mode: "ABY" },
	0xda: { name: "PHX", bytes: 1, cycles: 3, mode: "IMP" }, // 65C02
	0xdd: { name: "CMP", bytes: 3, cycles: 4, mode: "ABX" },
	0xde: { name: "DEC", bytes: 3, cycles: 7, mode: "ABX" },

	0xe0: { name: "CPX", bytes: 2, cycles: 2, mode: "IMM" },
	0xe1: { name: "SBC", bytes: 2, cycles: 6, mode: "IDX" },
	0xe4: { name: "CPX", bytes: 2, cycles: 3, mode: "ZP" },
	0xe5: { name: "SBC", bytes: 2, cycles: 3, mode: "ZP" },
	0xe6: { name: "INC", bytes: 2, cycles: 5, mode: "ZP" },
	0xe8: { name: "INX", bytes: 1, cycles: 2, mode: "IMP" },
	0xe9: { name: "SBC", bytes: 2, cycles: 2, mode: "IMM" },
	0xea: { name: "NOP", bytes: 1, cycles: 2, mode: "IMP" },
	0xec: { name: "CPX", bytes: 3, cycles: 4, mode: "ABS" },
	0xed: { name: "SBC", bytes: 3, cycles: 4, mode: "ABS" },
	0xee: { name: "INC", bytes: 3, cycles: 6, mode: "ABS" },

	0xf0: { name: "BEQ", bytes: 2, cycles: 2, mode: "REL" },
	0xf1: { name: "SBC", bytes: 2, cycles: 5, mode: "IDY" },
	0xf2: { name: "SBC", bytes: 2, cycles: 5, mode: "ZPI" }, // 65C02
	0xf5: { name: "SBC", bytes: 2, cycles: 4, mode: "ZPX" },
	0xf6: { name: "INC", bytes: 2, cycles: 6, mode: "ZPX" },
	0xf8: { name: "SED", bytes: 1, cycles: 2, mode: "IMP" },
	0xf9: { name: "SBC", bytes: 3, cycles: 4, mode: "ABY" },
	0xfa: { name: "PLX", bytes: 1, cycles: 4, mode: "IMP" }, // 65C02
	0xfd: { name: "SBC", bytes: 3, cycles: 4, mode: "ABX" },
	0xfe: { name: "INC", bytes: 3, cycles: 7, mode: "ABX" },
};
