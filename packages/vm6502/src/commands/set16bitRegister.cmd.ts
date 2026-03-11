import { toHex } from "@/lib/hex.utils";
import type { Command, ParamList } from "@/types/command";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

type Register = keyof typeof REGISTERS;
const REGISTERS = {
	PC: REG_PC_OFFSET,
} as const;

export const set16bitRegisterCmd: Command = {
	description: "",
	paramDef: ["string", "word"],
	group: "Monitor",
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const reg = (params[0] as string).toUpperCase() as Register;
		if (!reg) throw new Error(`Invalid register: ${reg}`);

		const val = params[1] as number;
		vm.sharedRegisters.setUint16(REGISTERS[reg], val, true);
		return `Register ${reg} set to $${toHex(val, 4)}`;
	},
};
