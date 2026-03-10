import type { Command, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const stepCmd: Command = {
	description: "Step Instruction",
	group: "Execution",
	fn: (vm: VirtualMachine, _progress: Ref<number>, _params: ParamList) => {
		// const val = params[0];
		// if (typeof val === "number") vm.sharedRegisters.setUint16(REG_PC_OFFSET, val, true);
		vm.step();
		return `One step beyond`;
	},
};
