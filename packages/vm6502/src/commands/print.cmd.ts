import { useCmdConsole } from "@/composables/useCmdConsole";
import type { Command } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const { print } = useCmdConsole();

export const printCmdFn: Command["fn"] = (_vm: VirtualMachine, _progress, params) => {
	const type = params[0] as string;
	const rest = params.slice(1);
	if (!rest) return "";
	let text = rest.join(" ");
	if (type === "markdown") text = text.replace(/<br>/g, "\n");
	print(type, text);
	return "";
};
