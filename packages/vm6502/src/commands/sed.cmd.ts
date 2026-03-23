import { defineCommand } from "@/composables/useCommands";

export const sedCmd = defineCommand({
	description: "Stream editor. Usage: `content` |> SED `pattern` `replacement`",
	paramDef: ["regex", "string", "string"],
	group: "Streams",
	fn: ({ params }) => {
		const originalRegex = params[0] as RegExp;
		const replacement = params[1] as string;
		const content = params[2] as string;
		try {
			const regex = new RegExp(originalRegex, "gm");
			return content.replace(regex, replacement);
		} catch (e: any) {
			throw new Error(`Invalid regex: ${e.message}`);
		}
	},
});
