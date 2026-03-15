import { useCmdConsole } from "@/composables/useCmdConsole";
import { useRoutineEditor } from "@/composables/useRoutineEditor";
import type { Command, CommandResult, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

const { hideConsole } = useCmdConsole();
const { close } = useRoutineEditor();

export const hideCmd: Command = {
	description: "Hide a component. Usage: HIDE `console` | `routines`.",
	paramDef: ["name"],
	group: "Console",
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList): CommandResult => {
		const component = (params[0] as string)?.toUpperCase();

		switch (component) {
			case "CONSOLE": {
				hideConsole();
				return "Console hidden.";
			}
			case "ROUTINES": {
				close();
				return "Routine Editor hidden.";
			}
			default:
				throw new Error(`Unknown component to hide: '${params[0]}'`);
		}
	},
};
