import { useFormatting } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";
import type { CommandContext, CommandDef } from "@/types/command";

export const defCode: CommandDef = {
	description: "Define code region at <address>.",
	paramDef: ["address"],
	group: "Memory",
	fn: async ({ params }: CommandContext) => {
		const address = params[0] as number;
		const { removeFormatting } = useFormatting();
		removeFormatting(address);
		return `Data region reset to code for ${formatAddress(address)}`;
	},
};
