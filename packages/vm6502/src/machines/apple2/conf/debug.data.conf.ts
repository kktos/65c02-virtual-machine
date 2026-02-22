import type { DataBlock } from "@/composables/useDataFormattings";

const datablocks = `
	[SYSTEM]
	00:FAD5 word[1]
`;

function parseDataBlocks(input: string) {
	const result: Record<number, Record<string, DataBlock>> = {};
	let currentScope = "user";

	for (const line of input.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			currentScope = trimmed.slice(1, -1);
			continue;
		}

		const [addrStr, type] = trimmed.split(/\s+/);
		if (addrStr && type) {
			const addr = parseInt(addrStr.replace(":", ""), 16);
			if (Number.isNaN(addr)) {
				console.warn("Invalid address in datablocks line", trimmed);
				continue;
			}

			const parts = type.match(/([^[]+)\[(\d+)\]/) as [unknown, string, string];
			if (parts[1] !== "byte" && parts[1] !== "word" && parts[1] !== "string") {
				console.warn("Unkown type in datablocks line", trimmed);
				continue;
			}

			const len = parseInt(parts[2], 10);
			if (Number.isNaN(len)) {
				console.warn("Invalid type lenght in datablocks line", trimmed);
				continue;
			}

			const block: DataBlock = {
				address: addr,
				type: parts[1],
				length: len,
				group: currentScope,
			};
			if (!result[addr]) result[addr] = {};
			result[addr][currentScope] = block;
		}
	}
	return result;
}

export const debugDataConfig: Record<number, Record<string, DataBlock>> = parseDataBlocks(datablocks);
