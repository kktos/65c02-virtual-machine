import { useGemini } from "@/composables/useGemini";
import { useMachine } from "@/composables/useMachine";
import { disassembleRange, formatDisassemblyAsText } from "@/lib/disassembler";
import type { CommandContext, CommandDef, CommandResult, ParamListItemIdentifier } from "@/types/command";

export const explainCmd: CommandDef = {
	description:
		"explain code from <range> [mode?] [output?]. Mode can be CONCISE (default) or DETAILED. Output can be CONSOLE (default) or ASNOTE (to create a Note).",
	paramDef: ["range", "name?", "name?"],
	group: "A.I.",
	closeOnSuccess: false,
	fn: async ({ vm, progress, params }: CommandContext): Promise<CommandResult> => {
		const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.read(address)) ?? 0;
		const { registers } = useMachine();
		const { explainCode } = useGemini();

		const range = params[0] as { start: number; end: number };
		const lines = disassembleRange({
			readByte,
			scope: vm.getScope(range.start),
			fromAddress: range.start,
			toAddress: range.end,
			registers,
		});
		const source = formatDisassemblyAsText(lines);

		let mode: "DETAILED" | "CONCISE" = "CONCISE";
		let outputTarget: "ASNOTE" | "CONSOLE" = "CONSOLE";

		const p1 = (params[1] as ParamListItemIdentifier)?.text.toUpperCase();
		const p2 = (params[2] as ParamListItemIdentifier)?.text.toUpperCase();

		const validModes = ["DETAILED", "CONCISE"];
		const validOutputs = ["ASNOTE", "CONSOLE"];

		// param 1 can be mode or output
		if (p1) {
			if (validModes.includes(p1)) {
				mode = p1 as "DETAILED" | "CONCISE";
			} else if (validOutputs.includes(p1)) {
				outputTarget = p1 as "ASNOTE" | "CONSOLE";
			} else {
				throw new Error("Invalid argument: must be a mode (DETAILED/CONCISE) or output (ASNOTE/CONSOLE).");
			}
		}

		// param 2 can only be output, and only if param 1 was a mode
		if (p2) {
			if (validOutputs.includes(p2)) {
				// if p1 was also an output, it's an error
				if (validOutputs.includes(p1 ?? "")) {
					throw new Error("Output target specified twice.");
				}
				outputTarget = p2 as "ASNOTE" | "CONSOLE";
			} else {
				throw new Error("Invalid third argument: must be an output target (ASNOTE/CONSOLE).");
			}
		}

		const updatePanel = outputTarget === "ASNOTE";
		const text = await explainCode(source, mode, { updatePanel, progress });
		if (!text) return "";

		if (outputTarget === "CONSOLE") {
			return {
				content: text,
				format: "markdown",
			};
		}

		return "Explanation panel updated.";
	},
};
