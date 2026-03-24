import { defineCommand, isParamListItemRange } from "@/composables/useCommands";
import { useGemini } from "@/composables/useGemini";
import { useMachine } from "@/composables/useMachine";
import { disassembleRange, formatDisassemblyAsText } from "@/lib/disassembler";

export const explainCmd = defineCommand({
	description:
		"explain code from <\u200brange> [--mode] [--output].\n" +
		"Mode can be concise (default) or detailed.\n" +
		" Output can be console (default) or asnote (to create a Note).",
	paramDef: ["range?", "rest"],
	options: [
		{
			name: "mode",
			value: { kind: "oneOf", choices: ["detailed", "concise"], default: "concise" },
		},
		{
			name: "output",
			value: { kind: "oneOf", choices: ["console", "asnote"], default: "console" },
		},
	] as const,
	group: "A.I.",
	closeOnSuccess: false,
	fn: async ({ vm, progress, params, opts }) => {
		const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.read(address)) ?? 0;
		const { registers } = useMachine();
		const { explainCode } = useGemini();

		let source = "";

		if (isParamListItemRange(params[0])) {
			const range = params[0] as { start: number; end: number };
			const lines = await disassembleRange({
				readByte,
				scope: vm.getScope(range.start),
				fromAddress: range.start,
				toAddress: range.end,
				registers,
			});
			source = formatDisassemblyAsText(lines);
		} else {
			if (typeof params[0] !== "string") throw new Error("Invalid content type. A string is needed here.");
			source = params[0];
		}

		const mode = opts.mode;
		const outputTarget = opts.output;

		const updatePanel = outputTarget === "asnote";
		const text = await explainCode(source, mode, { updatePanel, progress });
		if (!text) return "";

		if (outputTarget === "console") {
			return {
				content: text,
				format: "markdown",
			};
		}

		return "Explanation panel updated.";
	},
});
