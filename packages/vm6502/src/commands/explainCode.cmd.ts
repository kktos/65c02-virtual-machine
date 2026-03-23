import { defineCommand } from "@/composables/useCommands";
import { useGemini } from "@/composables/useGemini";
import { useMachine } from "@/composables/useMachine";
import { disassembleRange, formatDisassemblyAsText } from "@/lib/disassembler";

export const explainCmd = defineCommand({
	description:
		"explain code from <\u200brange> [--mode] [--output].\n" +
		"Mode can be concise (default) or detailed.\n" +
		" Output can be console (default) or asnote (to create a Note).",
	paramDef: ["range"],
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

		const range = params[0] as { start: number; end: number };
		const lines = disassembleRange({
			readByte,
			scope: vm.getScope(range.start),
			fromAddress: range.start,
			toAddress: range.end,
			registers,
		});
		const source = formatDisassemblyAsText(lines);

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
