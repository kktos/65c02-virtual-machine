import { useRoutines } from "@/composables/useRoutines";
import type { Command, ParamListItemIdentifier } from "@/types/command";

export const routineCmd: Command = {
	description: "Define a routine on multiple lines, ended by END.",
	paramDef: ["name"],
	group: "Scripting",
	fn: (_vm, _progress, params) => {
		const routineName = params[0] as ParamListItemIdentifier;
		if (!routineName) throw new Error("Routine name missing.");

		return {
			__isMultiLineRequest: true,
			prompt: `${routineName.text}|`,
			terminator: "END",
			onComplete: (lines: string[]) => {
				const { setRoutine } = useRoutines();
				setRoutine(routineName.text, lines);
				return `Routine '${routineName.text}' defined.`;
			},
		};
	},
};
