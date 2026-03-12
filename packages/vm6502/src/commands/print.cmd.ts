import { useCmdConsole } from "@/composables/useCmdConsole";
import { evalExpression } from "@/lib/eval.utils";
import type { Command } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export const printCmd: Command = {
	description:
		"Prints evaluated expressions to the console. Args can be strings, numbers, or expressions (e.g. A, X+1, mem[PC]).",
	paramDef: ["string", "rest?"],
	group: "Console",
	fn: (vm: VirtualMachine, _progress, params) => {
		const type = params[0] as string;
		const rest = params[1] as string | undefined;
		if (!rest) return "";

		const matches = rest.match(/(?:"[^"]*"|[^,]+)/g);
		if (!matches) return rest;

		// The try/catch is outside map, so it will throw and be caught by useCommands
		const evaluatedArgs = matches.map((arg) => {
			const currentArg = arg.trim();
			if (currentArg.startsWith('"') && currentArg.endsWith('"')) {
				return currentArg.substring(1, currentArg.length - 1);
			}
			// This will throw if it fails
			return evalExpression(currentArg, vm);
		});

		useCmdConsole().print(type, evaluatedArgs.join(" "));

		return "";
	},
};
