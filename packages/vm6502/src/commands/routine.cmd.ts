import { useRoutines } from "@/composables/useRoutines";
import type { Command, CommandContext, CommandSegment, ParamListItemIdentifier } from "@/types/command";

export const routineCmd: Command = {
	description: "Define a routine on multiple lines, ended by END.",
	paramDef: ["name"],
	group: "Scripting",
	fn: ({ params }: CommandContext) => {
		const routineName = params[0] as ParamListItemIdentifier;
		if (!routineName) throw new Error("Routine name missing.");

		return {
			__isMultiLineRequest: true,
			prompt: `${routineName.text}|`,
			terminator: "END",
			onComplete: (lines: (CommandSegment | string)[]) => {
				const { setRoutine } = useRoutines();

				let text = "";
				if (typeof lines[0] === "string") {
					text = lines.join("\n");
				} else {
					text = (lines as CommandSegment[]).map((line) => line.map((t) => t.text).join(" ")).join("\n");
				}
				setRoutine(routineName.text, text);
				return `Routine '${routineName.text}' defined.`;
			},
		};
	},
};
