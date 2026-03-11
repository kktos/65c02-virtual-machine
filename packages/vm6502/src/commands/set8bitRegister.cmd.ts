import { toHex } from "@/lib/hex.utils";
import type { Command, ParamList } from "@/types/command";
import {
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

type Register = keyof typeof REGISTERS;

const REGISTERS = {
	A: REG_A_OFFSET,
	X: REG_X_OFFSET,
	Y: REG_Y_OFFSET,
	PC: REG_PC_OFFSET,
	SP: REG_SP_OFFSET,
} as const;

export const set8bitRegisterCmd: Command = {
	description: "",
	paramDef: ["string", "byte"],
	group: "Monitor",
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const reg = (params[0] as string).toUpperCase() as Register;
		if (!reg) throw new Error(`Invalid register: ${reg}`);

		const val = params[1] as number;
		vm.sharedRegisters.setUint8(REGISTERS[reg], val);
		return `Register ${reg} set to $${toHex(val)}`;
	},
};
