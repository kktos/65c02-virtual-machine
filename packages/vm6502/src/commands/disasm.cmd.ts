import { defineCommand, isParamListItemRange } from "@/composables/useCommands";
import { disassemble, disassembleRange, formatDisassemblyAsText } from "@/lib/disassembler";
import type { ParamListItemRange } from "@/types/command";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";

export const disasmCmd = defineCommand({
	description:
		"Disasm from <\u200baddress> [for <\u200bword> lines (32 by default)].\n" +
		"Disasm a <\u200brange>.\n" +
		"Options: --lowercase for opcode names in lowercase.\n" +
		"Usage: d $f800.$f8ff or d $f800 or d $f800 50",
	paramDef: ["range|address", "word?"],
	options: [{ name: "lowercase" }] as const,
	group: "Assembler",
	fn: async ({ vm, params, opts }) => {
		const val = params[0] as number | ParamListItemRange;

		let start = 0;
		let end: number | undefined;
		if (isParamListItemRange(val)) {
			start = val.start;
			end = val.end;
		} else {
			start = val;
		}

		const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.read(address)) ?? 0;

		let lines: DisassemblyLine[];
		if (end !== undefined) {
			lines = await disassembleRange({
				readByte,
				scope: vm.getScope(start),
				fromAddress: start,
				toAddress: end,
				lowercase: opts.lowercase,
			});
		} else {
			const lineCount = params[1] as number | undefined;
			lines = await disassemble({
				readByte,
				scope: vm.getScope(start),
				fromAddress: start,
				lineCount: lineCount ?? 32,
				lowercase: opts.lowercase,
			});
		}

		const source = formatDisassemblyAsText(lines);
		return source;
	},
});
