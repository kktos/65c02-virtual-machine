import { isParamListItemIdentifier, isParamListItemRange } from "@/composables/useCommands";
import { useFormatting, type DataType } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";
import type { Command, CommandContext } from "@/types/command";

const TYPES = new Set(["byte", "word", "string"]);

export const defDataFn: Command["fn"] = async ({ params }: CommandContext) => {
	const type = params[0] as string;
	if (!TYPES.has(type)) throw new Error("Invalid data type.");

	let start: number;
	let end: number;
	if (isParamListItemRange(params[1])) {
		start = params[1].start;
		end = params[1].end;
	} else {
		start = params[1] as number;
		end = start;
	}
	const length = params[2] as number;
	const timesStr = isParamListItemIdentifier(params[3]) ? params[3].text : "";
	let times = 1;

	if (timesStr) {
		times = parseInt(timesStr.slice(1));
		if (times > 1 && start !== end) throw new Error("Times cannot be used with range.");
		end = start + times * length - 1;
	}

	const { addFormatting } = useFormatting();

	for (let i = start; i <= end; i += length) {
		const len = Math.min(length, end - i + 1);
		await addFormatting(i, type as DataType, len);
	}
	if (start !== end) return `Data regions set for ${formatAddress(start)}:${formatAddress(end)}: ${type}[${length}]`;
	else return `Data region set for ${formatAddress(start)}: ${type}[${length}]`;
};
