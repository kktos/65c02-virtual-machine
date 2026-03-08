import type { Command, ParamList } from "@/composables/useCommands";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const listHooks: Command = {
	description: "List all defined hooks (breakpoints with commands).",
	paramDef: [],
	fn: (_vm: VirtualMachine, _progress: Ref<number>, _params: ParamList) => {
		const { breakpoints } = useBreakpoints();
		const hooks = breakpoints.value.filter((bp) => !!bp.command);

		if (hooks.length === 0) return "No hooks defined.";

		const output = hooks.map((bp) => {
			const type = bp.type.toUpperCase().padEnd(6);
			const addr = `${formatAddress(bp.address)}`.padEnd(9);
			const state = (bp.enabled ? "on" : "off").padEnd(6);
			return `${type} ${addr} ${state} ${bp.command}`;
		});

		return `TYPE   ADDRESS   STATE  COMMAND\n${output.join("\n")}`;
	},
};
