import { useRoutines } from "@/composables/useRoutines";
import type { Command } from ".";

export const routineCmd: Command = {
	description: "Define a routine on multiple lines, ended by END.",
	paramDef: ["string"],
	group: "Scripting",
	fn: (_vm, _progress, params) => {
		const routineName = params[0] as string;
		if (!routineName) throw new Error("Routine name missing.");

		return {
			__isMultiLineRequest: true,
			prompt: `${routineName}|`,
			terminator: "END",
			onComplete: (lines: string[]) => {
				const { setRoutine } = useRoutines();
				setRoutine(routineName, lines);
				return `Routine '${routineName}' defined.`;
			},
		};
	},
};
