import { useRoutines } from "@/composables/useRoutines";
import type { CommandContext, CommandDef, ParamListItemIdentifier } from "@/types/command";

export const routineCmd: CommandDef = {
	description: "Define a routine on multiple lines, ended by END.",
	paramDef: ["name", "rest"],
	group: "Scripting",
	fn: ({ params }: CommandContext) => {
		const routineName = params[0] as ParamListItemIdentifier;
		if (!routineName) throw new Error("Routine name missing.");

		// Collect arguments (e.g. routine test @arg1 @arg2)
		const args: string[] = [];
		for (let i = 1; i < params.length; i++) args.push(String(params[i]));

		const lines: string[] = [];
		return {
			__isMultiLineRequest: true,
			prompt: `${routineName.text}.00|`,
			terminator: "END",
			onLine: (line: string) => {
				lines.push(line);
				return { prompt: `${routineName.text}.${lines.length.toString(16).padStart(2, "0")}|` };
			},
			onComplete: () => {
				const { setRoutine } = useRoutines();
				setRoutine(routineName.text, lines.join("\n"), args);
				return `Routine '${routineName.text}' defined.`;
			},
		};
	},
};
