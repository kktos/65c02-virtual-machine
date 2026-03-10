import { useBreakpoints } from "@/composables/useBreakpoints";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";
import { useRoutines } from "@/composables/useRoutines";
import type { Command, ParamList } from "@/types/command";
import { useCommands } from "@/composables/useCommands";

function listHooks() {
	const { breakpoints } = useBreakpoints();
	const hooks = breakpoints.value.filter((bp) => !!bp.command);

	if (hooks.length === 0) return "No hooks defined.";

	const header = "| Type | Address | State | Command |\n|---|---|---|---|";
	const rows = hooks.map((bp) => {
		const type = bp.type.toUpperCase();
		const addr = formatAddress(bp.address);
		const state = bp.enabled ? "on" : "off";
		const command = bp.command;
		return `| ${type} | ${addr} | ${state} | ${command} |`;
	});

	return `${header}\n${rows.join("\n")}`;
}

function listRoutines() {
	const { getRoutineNames } = useRoutines();
	const routineNames = getRoutineNames();
	if (routineNames.length === 0) return "No routines defined.";

	return routineNames.map((name) => `* \`${name}\``).join("\n");
}

function listHistory() {
	const { commandHistory } = useCommands();
	if (commandHistory.value.length === 0) return "Command history is empty.";
	const shortenString = (s: string) => {
		s = s.replace("\n", " ");
		if (s.length > 15) return s.slice(0, 15) + "...";
		return s;
	};
	const historyList = commandHistory.value
		.map((cmd, index) => `${(index + 1).toString().padStart(3, "\u00A0")}: ${shortenString(cmd)}`)
		.join("  \n");
	return `${historyList}\n`;
}

export const listCmd: Command = {
	description: "List <hooks|routines|history>.",
	paramDef: ["string"],
	group: "Console",
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const cmd = params[0] as string;
		let content: string;
		switch (cmd.toUpperCase()) {
			case "HOOKS":
				content = listHooks();
				break;
			case "ROUTINES":
				content = listRoutines();
				break;
			case "HISTORY":
				content = listHistory();
				break;
			default:
				throw new Error("Invalid list name");
		}
		return {
			content,
			format: "markdown",
		};
	},
};
