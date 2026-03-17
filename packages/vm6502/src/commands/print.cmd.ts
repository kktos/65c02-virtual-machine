import { useCmdConsole } from "@/composables/useCmdConsole";
import type { Command, CommandContext } from "@/types/command";

const { print } = useCmdConsole();

export const printCmdFn: Command["fn"] = ({ params, pipeDest }: CommandContext) => {
	const type = params[0] as string;
	const rest = params.slice(1);
	if (!rest) return "";
	let text = rest.join(" ");
	if (type === "markdown") text = text.replace(/<br>/g, "\n");
	if (pipeDest > 0) return text;
	else print(type, text);
	return "";
};
