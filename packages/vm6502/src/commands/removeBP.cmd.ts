import type { Command, ParamList } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useBreakpoints } from "@/composables/useBreakpoints";
import type { Ref } from "vue";
import type { Breakpoint } from "@/types/breakpoint.interface";

export const removeBreakpointCommand: Command = {
	description: "Remove a breakpoint of a given type at an address. Params: <type> <address>",
	paramDef: ["string", "address"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const type = params[0] as Breakpoint["type"];
		const address = params[1] as number;

		const { removeBreakpoint } = useBreakpoints();

		removeBreakpoint({ type, address }, vm);

		return `Breakpoint removed at ${formatAddress(address)}`;
	},
};

export const execRemoveBP = (type: "pc" | "access" | "write" | "read") => {
	return async (vm: VirtualMachine, _p: Ref<number>, params: ParamList) => {
		const param = params[0];
		let addr: number;
		let endAddr: number | undefined;

		if (typeof param === "object" && param !== null && "start" in param) {
			addr = param.start;
			endAddr = param.end;
		} else if (typeof param === "number") {
			addr = param;
		} else {
			throw new Error("Invalid address parameter");
		}

		const { removeBreakpoint } = useBreakpoints();
		removeBreakpoint({ type, address: addr, endAddress: endAddr, enabled: true }, vm);

		return `Breakpoint (${type}) removed`;
	};
};
