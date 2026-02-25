import type { Command, ParamList } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useBreakpoints } from "@/composables/useBreakpoints";
import type { Ref } from "vue";
import type { Breakpoint } from "@/types/breakpoint.interface";

export const addBreakpointCommand: Command = {
	description: "Add a breakpoint of a given type at an address. Params: <type> <address>",
	paramDef: ["string", "long"],
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const type = params[0] as Breakpoint["type"];
		const address = params[1] as number;

		const { addBreakpoint } = useBreakpoints();

		addBreakpoint({ type, address }, vm);

		return `Breakpoint added at ${formatAddress(address)}`;
	},
};
