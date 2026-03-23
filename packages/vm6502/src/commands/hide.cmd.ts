import { useFloatingWindows } from "@/composables/useFloatingWindows";
import type { CommandContext, CommandDef, CommandResult } from "@/types/command";

const { availableWindows, close } = useFloatingWindows();
export const hideCmd: CommandDef = {
	description: "Hide a window. Usage: HIDE `windowID`.",
	paramDef: ["name"],
	group: "Console",
	fn: ({ params }: CommandContext): CommandResult => {
		const windowID = (params[0] as string)?.toUpperCase();
		const window = availableWindows.value.find((win) => win.id.toUpperCase().startsWith(windowID));
		if (!window) throw new Error(`Unknown window: '${params[0]}'`);
		close(window.id);
		return `Window '${window.title}' closed.`;
	},
};
