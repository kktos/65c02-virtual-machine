import { runHexDump } from "@/lib/mini-monitor";
import type { Command, CommandContext } from "@/types/command";

export const hexDumpCmd: Command = {
	description: "Displays a hex dump of a memory range. Usage: HD <\u200bfrom> <\u200bto>",
	paramDef: ["address", "address"],
	group: "Memory",
	fn: ({ vm, params }: CommandContext) => {
		let from = params[0] as number;
		let to = params[1] as number;
		from = Math.min(from, to);
		to = Math.max(from, to);
		return runHexDump(from, to, vm);
	},
};
