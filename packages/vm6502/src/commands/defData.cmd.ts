import { useFormatting, type DataType } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";
import type { Command, CommandContext } from "@/types/command";

const TYPES = new Set(["byte", "word", "string"]);

export const defDataFn: Command["fn"] = async ({ params }: CommandContext) => {
	const type = params[0] as string;
	if (!TYPES.has(type)) throw new Error("Invalid data type.");

	const address = params[1] as number;
	const length = params[2] as number;

	const { addFormatting } = useFormatting();

	addFormatting(address, type as DataType, length);

	return `Data region set for ${formatAddress(address)}: $${type}[${length}]`;
};
