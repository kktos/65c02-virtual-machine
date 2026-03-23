import { useFloatingWindows } from "@/composables/useFloatingWindows";
import type { CommandContext, CommandDef, CommandResult, ParamListItemIdentifier } from "@/types/command";

const { availableWindows, open } = useFloatingWindows();

export const showCmd: CommandDef = {
	description: "Show a window. Usage: SHOW to list all the windows or SHOW `windowID`.",
	paramDef: ["name?"],
	group: "Console",
	fn: ({ params }: CommandContext): CommandResult => {
		const windowID = params[0] as ParamListItemIdentifier;

		if (windowID) {
			const id = windowID.text.toUpperCase();
			const window = availableWindows.value.find((win) => win.id.toUpperCase().match(id));

			if (!window) throw new Error(`Unknown window: '${params[0]}'`);
			open(window.id);
			return `Window '${window.title}' opened.`;
		} else {
			const winList: string[] = ["| ID | Title |", "|---|---|"];
			for (const window of availableWindows.value) {
				winList.push(`|${window.id}|${window.title}|`);
			}
			return { content: winList.join("\n"), format: "markdown" };
		}
	},
};
