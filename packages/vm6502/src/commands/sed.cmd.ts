import type { Command } from "@/types/command";

export const sedCmd: Command = {
	description: "Stream editor. Usage: `content` |> SED `pattern` `replacement`",
	paramDef: ["string", "string", "string"],
	group: "Streams",
	fn: ({ params }) => {
		const pattern = params[0] as string;
		const replacement = params[1] as string;
		const content = params[2] as string;
		try {
			const regex = new RegExp(pattern, "gm");
			return content.replace(regex, replacement);
		} catch (e: any) {
			throw new Error(`Invalid regex: ${e.message}`);
		}
	},
};
