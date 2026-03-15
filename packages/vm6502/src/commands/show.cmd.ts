import { useFloatingWindows } from "@/composables/useFloatingWindows";
import type { Command, CommandResult, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

const { availableWindows, open } = useFloatingWindows();

export const showCmd: Command = {
	description: "Show a window. Usage: SHOW to list all the windows or SHOW `windowID`.",
	paramDef: ["name?"],
	group: "Console",
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList): CommandResult => {
		const windowID = (params[0] as string)?.toUpperCase();

		if (windowID) {
			const window = availableWindows.value.find((win) => win.id.toUpperCase().match(windowID));

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
