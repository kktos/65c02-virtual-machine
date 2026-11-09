import { defineCommand } from "@/composables/useCommands";
import { parseFormatsLine, useFormatting, type StoredFormat } from "@/composables/useDataFormattings";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";

const { addManyFormattings } = useFormatting();

export const formatsCmd = defineCommand({
	description: "Define multiple data formattings. Usage: FORMATS [<​group>] ... END_FORMATS",
	paramDef: ["name?"],
	group: "Memory",
	fn: ({ params }: CommandContext) => {
		const group = (params[0] as ParamListItemIdentifier)?.text || "user";
		const formattings: StoredFormat[] = [];

		return {
			__isMultiLineRequest: true,
			prompt: `FORMATS ${group}|`,
			terminator: "END_FORMATS",
			onLine: async (line: string, lineIndex: number) => {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith(";")) return;

				const parsed = parseFormatsLine(line);
				if (typeof parsed === "string") return { error: `FORMATS: ${parsed} on line ${lineIndex}` };

				formattings.push({ ...parsed, group });
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
