import { useCmdConsole } from "@/composables/useCmdConsole";
import { useRoutineEditor } from "@/composables/useRoutineEditor";
import type { Command, CommandResult, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

const { showConsole } = useCmdConsole();
const { open } = useRoutineEditor();

export const showCmd: Command = {
	description: "Show a component. Usage: SHOW `console` | `routines`.",
	paramDef: ["name"],
	group: "Console",
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList): CommandResult => {
		const component = (params[0] as string)?.toUpperCase();

		switch (component) {
			case "CONSOLE": {
				showConsole();
				return "Console shown.";
			}
			case "ROUTINES": {
				open();
				return "Routine Editor shown.";
			}
			default:
				throw new Error(`Unknown component to show: '${params[0]}'`);
		}
	},
};
