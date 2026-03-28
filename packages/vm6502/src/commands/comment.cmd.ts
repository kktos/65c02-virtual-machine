import { useComments } from "@/composables/useComments";
import { defineCommand } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";

export const commentCmd = defineCommand({
	description: "Add a comment to an address. Usage: comment <\u200baddress> [-b] <\u200btext>",
	paramDef: ["address", "rest"],
	options: [{ name: "b" }] as const,
	group: "Assembler",
	fn: ({ params, opts }) => {
		const address = params[0] as number;
		let text = (params[1] as string) || "";

		if (address === undefined || text.trim() === "") {
			throw new Error("Usage: comment <address> <text>");
		}

		const { addComment } = useComments();

		addComment(address, opts.b ? "block" : "inline", text);

		return `Comment added at ${formatAddress(address)}`;
	},
});
