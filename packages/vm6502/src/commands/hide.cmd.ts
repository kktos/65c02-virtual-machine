import { defineCommand } from "@/composables/useCommands";
import { useFloatingWindows } from "@/composables/useFloatingWindows";
import type { CommandContext, CommandResult, ParamListItemIdentifier } from "@/types/command";

const { availableWindows, close } = useFloatingWindows();
export const hideCmd = defineCommand({
	description: "Hide a window. Usage: HIDE `windowID`.",
	paramDef: ["name"],
	group: "Console",
	fn: ({ params }: CommandContext): CommandResult => {
		const windowID = (params[0] as ParamListItemIdentifier).text.toUpperCase();
		const window = availableWindows.value.find((win) => win.id.toUpperCase().startsWith(windowID));
		if (!window) throw new Error(`Unknown window: '${windowID}'`);
		close(window.id);
		return `Window '${window.title}' closed.`;
	},
});
