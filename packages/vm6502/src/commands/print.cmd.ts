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

		const evaluatedArgs = matches.map((arg) => evalExpression(arg, vm));

		useCmdConsole().print(type, evaluatedArgs.join(" "));

		return "";
	},
};
