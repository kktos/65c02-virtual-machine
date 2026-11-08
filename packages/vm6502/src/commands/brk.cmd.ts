import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { useMachine } from "@/composables/useMachine";
import type { CommandContext } from "@/types/command";

export const brkCmd = defineCommand({
	description:
		"Break on BRK: `on` stops the machine on a BRK (default), `off` runs it through the $FFFE vector. " +
		"No argument shows the current setting.",
	paramDef: ["name?"],
	paramHelp: "[on|off]",
	group: "Breakpoints",
	fn: ({ params }: CommandContext) => {
		const { breakOnBrk, setBreakOnBrk } = useMachine();
		const arg = params[0];
		if (arg !== undefined) {
			const value = isParamListItemIdentifier(arg) ? arg.text.toUpperCase() : "";
			if (value !== "ON" && value !== "OFF") throw new Error("Expected `on` or `off`.");
			setBreakOnBrk(value === "ON");
		}
		return `Break on BRK: ${breakOnBrk.value ? "on" : "off"}`;
	},
});
