import { formatAddress, hexDump, toHex } from "@/lib/hex.utils";
import type { CommandContext, CommandDef, CommandResult } from "@/types/command";

export const searchCmd: CommandDef = {
	description:
		"Search memory.\n" +
		'Usage: SEARCH [start:end] <"string" | hex bytes>\n' +
		"String Wildcards: ? any characters; [] one of the characters; \\ escape character.\n" +
		"Bytes Wildcards: ?? any value.\n",
	paramDef: ["range?", "string?", "wbyte*"],
	group: "Memory",
	fn: ({ vm, params }: CommandContext): CommandResult => {
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
		let bytes: (number | null)[] = [];
		const constraints: number[][] = [];

		arg = params[parmIdx];

		if (typeof arg === "string") {
			if (params.length !== parmIdx + 1) throw new Error("Could only search one string at a time.");

			const str = arg;
			let i = 0;
			while (i < str.length) {
				const char = str[i];
				if (char === "\\") {
					i++;
					if (i < str.length) bytes.push(str.charCodeAt(i) & 0x7f);
					i++;
					continue;
				}

				if (char === "?") {
					bytes.push(null);
					i++;
					continue;
				}

				if (char === "[") {
					i++;
					const group: number[] = [];
					while (i < str.length && str[i] !== "]") {
						const c = str[i];
						if (c === "\\") {
							i++;
							if (i < str.length) group.push(str.charCodeAt(i) & 0x7f);
						} else {
							group.push(c.charCodeAt(0) & 0x7f);
						}
						i++;
					}
					if (group.length === 0) throw new Error("Empty characters group [].");
					if (i < str.length) i++; // consume ']'
					bytes.push(null);
					constraints.push(group);
					continue;
				}

				bytes.push(char.charCodeAt(0) & 0x7f);
				i++;
			}
			is7Bit = true;
		} else {
			is7Bit = false;
			for (; parmIdx < params.length; parmIdx++) {
				const arg = params[parmIdx] as number | null;
				bytes.push(arg);
			}
		}

		if (bytes.length === 0) throw new Error("Empty search pattern.");

		// Assumes vm.search wraps bus.search(pattern, start, end, is7Bit, constraints)
		const results = vm.search(bytes, start, end, is7Bit, constraints.length > 0 ? constraints : undefined);

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
				const dumpBytes = vm.readDebugRange(addr, 0x30, r.location);
				const dump = hexDump(addr, dumpBytes, { highlight: { start: r.address, length: bytes.length } });
				return `[${formatAddress(r.address)}](command:&disasm_at%20$${toHex(r.address)}%20@CTRL "Click to view in Disasm Viewer") (${r.location})\n\n\n${dump}\n`;
			})
			.join("\n\n");

		return { content: `${output}\n${resultText}`, format: "markdown" };
	},
};
