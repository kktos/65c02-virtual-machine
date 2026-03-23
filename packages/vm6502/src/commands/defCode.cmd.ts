import { defineCommand } from "@/composables/useCommands";
import { useFormatting } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";
import type { CommandContext } from "@/types/command";

export const defCode = defineCommand({
	description: "Define code region at <address>.",
	paramDef: ["address"],
	group: "Memory",
	fn: async ({ params }: CommandContext) => {
		const address = params[0] as number;
		const { removeFormatting } = useFormatting();
		removeFormatting(address);
		return `Data region reset to code for ${formatAddress(address)}`;
	},
});
