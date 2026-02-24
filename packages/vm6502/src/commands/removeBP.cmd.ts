import type { Command, ParamList } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useBreakpoints } from "@/composables/useBreakpoints";
import type { Ref } from "vue";

export const removeBP: Command = {
	description: "Remove execution breakpoint",
	paramDef: ["long"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;

		const { removeBreakpoint } = useBreakpoints();

		removeBreakpoint({ type: "pc", address }, vm);

		return `Breakpoint removed at ${formatAddress(address)}`;
	},
};
export const removeBPA: Command = {
	description: "Remove Mem Access breakpoint",
	paramDef: ["long"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;

		const { removeBreakpoint } = useBreakpoints();

		removeBreakpoint({ type: "access", address }, vm);

		return `Breakpoint Mem Access removed at ${formatAddress(address)}`;
	},
};
export const removeBPW: Command = {
	description: "Remove Mem Write breakpoint",
	paramDef: ["long"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;

		const { removeBreakpoint } = useBreakpoints();

		removeBreakpoint({ type: "write", address }, vm);

		return `Breakpoint Mem Write removed at ${formatAddress(address)}`;
	},
};
export const removeBPR: Command = {
	description: "Remove Mem Read breakpoint",
	paramDef: ["long"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;

		const { removeBreakpoint } = useBreakpoints();

		removeBreakpoint({ type: "read", address }, vm);

		return `Breakpoint Mem Read removed at ${formatAddress(address)}`;
	},
};
