import { useSymbols } from "@/composables/useSymbols";
import type { Command, CommandContext, CommandResult } from "@/types/command";

const { setScopeSearchPath, scopeSearchPath } = useSymbols();

export const scopePathCmd: Command = {
	description: "Get or set the scope search path. Usage: SCOPEPATH [scope1 scope2 ...]",
	paramDef: ["rest?"],
	group: "Symbols",
	fn: async ({ params }: CommandContext): Promise<CommandResult> => {
		if (params.length === 0)
			return {
				content: `Current scope search path: [${scopeSearchPath.value.join(", ")}]`,
				format: "text",
			};

		const paths: string[] = [];
		for (const param of params) {
			if (typeof param === "string") paths.push(param);
			else throw new Error("Invalid scope path");
		}
		setScopeSearchPath(paths);

		return {
			content: `Scope search path updated to: [${paths.join(", ")}]`,
			format: "text",
		};
	},
};
