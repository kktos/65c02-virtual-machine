import type { Command, ParamList } from "@/composables/useCommands";
import { useConsoleSettings } from "@/composables/useConsoleSettings";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const font: Command = {
	description: "Get or set the console font family. Params: [font_name?]",
	paramDef: ["string?"],
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const newName = params[0] as string | undefined;
		const { fontFamily } = useConsoleSettings();

		if (newName) {
			fontFamily.value = newName;
			return `Console font set to '${newName}'.`;
		}

		return `Current console font is '${fontFamily.value}'.`;
	},
};
