import type { Command, ParamList } from "@/composables/useCommands";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";
import { useRoutines } from "@/composables/useRoutines";

function listHooks() {
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
}

function listRoutines() {
	const { getRoutineNames } = useRoutines();
	const routineNames = getRoutineNames();
	if (routineNames.length === 0) return "No routines defined.";

	return "Defined routines:\n" + routineNames.map((name) => `- ${name}`).join("\n");
}

export const listCmd: Command = {
	description: "List <hooks|routines>.",
	paramDef: ["string"],
	group: "Console",
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const cmd = params[0] as string;
		switch (cmd.toUpperCase()) {
			case "HOOKS":
				return listHooks();
			case "ROUTINES":
				return listRoutines();
			default:
				throw new Error("Invalid list name");
		}
	},
};
