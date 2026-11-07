import { isParamListItemIdentifier, isParamListItemRange } from "@/composables/useCommands";
import { useFormatting, type DataType } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";
import type { Command, CommandContext } from "@/types/command";

const TYPES = new Set(["byte", "word", "string"]);

export const defDataFn: Command["fn"] = async ({ params }: CommandContext) => {
	const type = params[0] as string;
	if (!TYPES.has(type)) throw new Error("Invalid data type.");

	const where = params[1];
	const isRange = isParamListItemRange(where);
	const length = params[2] as number;
	const timesStr = isParamListItemIdentifier(params[3]) ? params[3].text : "";
	const times = timesStr ? parseInt(timesStr.slice(1)) : 1;
	if (isRange && times > 1) throw new Error("Times cannot be used with range.");

	let start: number;
	let end: number;
	if (isParamListItemRange(where)) {
		start = where.start;
		end = where.end;
	} else {
		// A single address covers `times` regions of `length`, e.g. "da $FF0A 9" is one string of 9
		start = where as number;
		end = start + times * length - 1;
	}

	const { addFormatting } = useFormatting();

	for (let i = start; i <= end; i += length) {
		const len = Math.min(length, end - i + 1);
		await addFormatting(i, type as DataType, len);
	}
	const regions = Math.ceil((end - start + 1) / length);
	if (regions > 1)
		return `${regions} data regions set for ${formatAddress(start)}:${formatAddress(end)}: ${type}[${length}]`;
	return `Data region set for ${formatAddress(start)}: ${type}[${length}]`;
};
