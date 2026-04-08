import { defineCommand } from "@/composables/useCommands";
import { useFormatting, type DataType } from "@/composables/useDataFormattings";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

const { addManyFormattings } = useFormatting();

export const formatsCmd = defineCommand({
	description: "Define multiple data formattings. Usage: FORMATS [<\u200bgroup>] ... END_FORMATS",
	paramDef: ["name?"],
	group: "Memory",
	fn: ({ params }: CommandContext) => {
		const group = (params[0] as ParamListItemIdentifier)?.text || "user";
		const formattings: { address: number; type: DataType; length: number; group: string }[] = [];

		return {
			__isMultiLineRequest: true,
			prompt: `FORMATS ${group}|`,
			terminator: "END_FORMATS",
			onLine: async (line: string, lineIndex: number) => {
				const trimmed = line.trim();
				if (!trimmed) return;

				const parts = trimmed.split(/\s+/);
				if (parts.length < 2) return { error: `FORMATS: Invalid line ${lineIndex}: "${line}"` };

				const addrStr = parts[0].replace(/^(0x|\$)/, "");
				const address = parseInt(addrStr, 16);
				if (Number.isNaN(address))
					return { error: `FORMATS: Invalid address "${parts[0]}" on line ${lineIndex}` };

				const typeChar = parts[1].toLowerCase();
				let type: DataType;
				let unitSize = 1;

				if (typeChar === "w") {
					type = "word";
					unitSize = 2;
				} else if (typeChar === "b") {
					type = "byte";
					unitSize = 1;
				} else if (typeChar === "s") {
					type = "string";
					unitSize = 1;
				} else {
					return { error: `FORMATS: Invalid type "${parts[1]}" on line ${lineIndex}. Use w, b, or s.` };
				}

				const count = parts[2] ? parseInt(parts[2], 10) : 1;
				if (Number.isNaN(count)) return { error: `FORMATS: Invalid count "${parts[2]}" on line ${lineIndex}` };

				formattings.push({ address, type, length: count * unitSize, group });
				return { prompt: `FORMATS ${group}|` };
			},
			onComplete: async () => {
				if (formattings.length === 0) return "No formats defined.";
				try {
					await addManyFormattings(formattings);
				} catch (e) {
					return { error: `FORMATS ${group}: ${e}` };
				}
				return `Defined ${formattings.length} data formattings in group '${group}'.`;
			},
		};
	},
});
