import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import type { CommandContext, ParamListItem } from "@/types/command";

const keyword = (param: ParamListItem | undefined) =>
	isParamListItemIdentifier(param) ? param.text.toLowerCase() : undefined;

/** `[over | out [through]]`, as the params come: names. */
const parseStepParams = (params: ParamListItem[]) => {
	if (params.length === 0) return { mode: "into" as const, through: false };
	const mode = keyword(params[0]);
	if (mode !== "over" && mode !== "out") throw new Error("Expected `over` or `out`.");
	if (params.length > 1 && keyword(params[1]) !== "through") throw new Error("Expected `through` or nothing.");
	return { mode, through: params.length > 1 };
};

export const stepCmd = defineCommand({
	description:
		"Step one instruction (Step Into).\n" +
		"`over`: a JSR runs to the instruction after it (anything else is one step). `out`: runs until the routine " +
		"returns. The breakpoints on the way stop them; the step then stays armed: RUN goes on to its end.\n" +
		"`through`: the breakpoints don't stop them, their hooks still run, until they stop for something else " +
		"(pause, BRK...).",
	paramDef: ["name?", "name?"],
	paramHelp: "[over | out [through]]",
	group: "Execution",
	fn: async ({ vm, params }: CommandContext) => {
		const { mode, through } = parseStepParams(params);
		if (mode === "into") {
			vm.step();
			return "One step beyond";
		}
		if (vm.isRunning) throw new Error("The machine is running: pause it first.");
		const { running } = await (mode === "over" ? vm.stepOver(through) : vm.stepOut(through));
		if (!running) return "Not a JSR: one step";
		return `Step ${mode}${through ? ", through the breakpoints" : ""}`;
	},
});
