import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { toHex } from "@/lib/hex.utils";
import type { CommandContext } from "@/types/command";
import {
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";

type Register8 = keyof typeof BYTE_REGISTERS;
type Register16 = keyof typeof WORD_REGISTERS;
type Register = Register8 | Register16;

const BYTE_REGISTERS = {
	A: REG_A_OFFSET,
	X: REG_X_OFFSET,
	Y: REG_Y_OFFSET,
	P: REG_STATUS_OFFSET,
	SP: REG_SP_OFFSET,
} as const;

const WORD_REGISTERS = {
	PC: REG_PC_OFFSET,
} as const;

export const setCmd = defineCommand({
	description: "Set register `name` value to `byte` or `word`",
	paramDef: ["name", "byte|word"],
	group: "Monitor",
	fn: ({ vm, params }: CommandContext) => {
		const val = params[1] as number;

		// `set pc $300` hands over the parsed name ({ text, value });
		// `pc = $300` the text, and `$300 = 12` the address as a decimal string.
		const dest = isParamListItemIdentifier(params[0]) ? params[0].text : String(params[0]);

		if (/^[0-9]+$/.test(dest)) {
			const addr = parseInt(dest);
			vm.writeDebug(addr, val);
			return `$${toHex(addr)} = $${toHex(val)}`;
		}

		const reg = dest.toUpperCase() as Register;

		if (reg in BYTE_REGISTERS) {
			if (val > 0xff || val < 0) throw new Error(`Value out of range [0-255]`);
			vm.sharedRegisters.setUint8(BYTE_REGISTERS[reg as Register8], val);
			return `Register ${reg} set to $${toHex(val)}`;
		}

		if (reg in WORD_REGISTERS) {
			if (val > 0xffff || val < 0) throw new Error(`Value out of range [0-65535]`);
			vm.sharedRegisters.setUint16(WORD_REGISTERS[reg as Register16], val, true);
			return `Register ${reg} set to $${toHex(val, 4)}`;
		}

		throw new Error(`Invalid register: ${reg}`);
	},
});
