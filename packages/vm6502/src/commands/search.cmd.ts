import { formatAddress, hexDump } from "@/lib/hex.utils";
import type { Command, CommandResult, ParamList } from "@/types/command";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const searchCmd: Command = {
	description: 'Search memory. Usage: SEARCH [start:end] <"string" | hex bytes>',
	paramDef: ["rest"],
	group: "Memory",
	fn: (vm: VirtualMachine, _progress: Ref<number>, params: ParamList): CommandResult => {
		const maxBank = (vm.machineConfig.memory.banks ?? 1) - 1;

		let parmIdx = 0;
		let start = 0;
		let end = (maxBank << 16) | 0xffff;

		let arg = params[parmIdx];

		// Check for range at start: e.g. "C000:FFFF" or "$C000:$FFFF"
		const rangeMatch = arg && typeof arg === "object" && "start" in arg;
		if (rangeMatch) {
			const range = arg as { start: number; end: number };
			start = range.start;
			end = range.end;
			parmIdx++;
		}

		let is7Bit = false;
		let bytes: number[] = [];

		arg = params[parmIdx];

		if (typeof arg === "string") {
			const str = arg as string;
			for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0x7f);
			is7Bit = true;
		} else {
			for (; parmIdx < params.length; parmIdx++) {
				arg = params[parmIdx] as number;
				bytes.push(arg & 0xff);
				is7Bit = false;
			}
		}

		if (bytes.length === 0) throw new Error("Empty search pattern.");

		// Assumes vm.search wraps bus.search(pattern, start, end, is7Bit)
		const results = vm.search(new Uint8Array(bytes), start, end, is7Bit);

		if (!results || results.length === 0)
			return `No matches found in range. ${formatAddress(start)} - ${formatAddress(end)}`;

		const maxResults = 20;
		let output = `Found ${results.length} matches`;
		if (results.length > maxResults) output += ` (showing first ${maxResults})`;
		output += ":\n";

		const resultText = results
			.slice(0, maxResults)
			.map((r) => {
				const addr = (r.address - 0x10) & ~0xf;
				const dumpBytes = vm.readDebugRange(addr, 0x30);
				const dump = hexDump(addr, dumpBytes, { highlight: { start: r.address, length: bytes.length } });
				return `  ${formatAddress(r.address)} (${r.location})\n\n\n${dump}\n`;
			})
			.join("\n\n");

		return { content: `${output}\n${resultText}`, format: "markdown" };
	},
};
