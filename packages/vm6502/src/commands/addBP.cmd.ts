import type { Command, ParamList } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useBreakpoints } from "@/composables/useBreakpoints";
import type { Ref } from "vue";

export const addBP: Command = {
	description: "Add execution breakpoint",
	paramDef: ["long"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;

		const { addBreakpoint } = useBreakpoints();

		addBreakpoint({ type: "pc", address }, vm);

		return `Breakpoint added at ${formatAddress(address)}`;
	},
};
export const addBPA: Command = {
	description: "Add Mem Access breakpoint",
	paramDef: ["long"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;

		const { addBreakpoint } = useBreakpoints();

		addBreakpoint({ type: "access", address }, vm);

		return `Breakpoint Mem Access added at ${formatAddress(address)}`;
	},
};
export const addBPW: Command = {
	description: "Add Mem Read breakpoint",
	paramDef: ["long"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;

		const { addBreakpoint } = useBreakpoints();

		addBreakpoint({ type: "read", address }, vm);

		return `Breakpoint Mem Read added at ${formatAddress(address)}`;
	},
};
export const addBPR: Command = {
	description: "Add Mem Write breakpoint",
	paramDef: ["long"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;

		const { addBreakpoint } = useBreakpoints();

		addBreakpoint({ type: "write", address }, vm);

		return `Breakpoint Mem Write added at ${formatAddress(address)}`;
	},
};
