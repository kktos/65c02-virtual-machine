import { useSymbols } from "@/composables/useSymbols";
import type { Command, CommandResult, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const scopePathCmd: Command = {
	description: "Get or set the scope search path. Usage: SCOPEPATH [scope1 scope2 ...]",
	paramDef: ["rest?"],
	group: "Symbols",
	fn: async (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList): Promise<CommandResult> => {
		const rawArgs = (params[0] as string) || "";
		const { setScopeSearchPath, scopeSearchPath } = useSymbols();

		const paths = rawArgs.split(/\s+/).filter((p) => p.trim() !== "");
		if (paths.length === 0)
			return {
				content: `Current scope search path: [${scopeSearchPath.value.join(", ")}]`,
				format: "text",
			};

		setScopeSearchPath(paths);

		return {
			content: `Scope search path updated to: [${paths.join(", ")}]`,
			format: "text",
		};
	},
};
