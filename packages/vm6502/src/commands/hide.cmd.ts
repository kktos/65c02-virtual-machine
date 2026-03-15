import { useFloatingWindows } from "@/composables/useFloatingWindows";
import type { Command, CommandResult, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

const { availableWindows, close } = useFloatingWindows();
export const hideCmd: Command = {
	description: "Hide a window. Usage: HIDE `windowID`.",
	paramDef: ["name"],
	group: "Console",
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList): CommandResult => {
		const windowID = (params[0] as string)?.toUpperCase();
		const window = availableWindows.value.find((win) => win.id.toUpperCase().startsWith(windowID));
		if (!window) throw new Error(`Unknown window: '${params[0]}'`);
		close(window.id);
		return `Window '${window.title}' closed.`;
	},
};
