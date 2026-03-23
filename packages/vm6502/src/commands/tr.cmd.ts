import { defineCommand } from "@/composables/useCommands";
import type { ParamListItemIdentifier } from "@/types/command";

export const transformCmd = defineCommand({
	description: "Tranform a stream. Usage: `content_producer` |> TR type",
	paramDef: ["name", "string"],
	group: "Streams",
	fn: async ({ params }) => {
		const type = params[0] as ParamListItemIdentifier;
		const content = params[1] as string;

		switch (type.text.toUpperCase()) {
			// case "JSON":
			case "TEXT":
				return convertToText(content);

			default:
				throw new Error("Uknown transform type");
		}
	},
});

function convertToText(content: string): string {
	return content
		.replaceAll("<br/>", "\n")
		.replaceAll("&nbsp;", " ")
		.replaceAll("\\-", "-")
		.replaceAll("\\_", "_")
		.replaceAll("\\`", "`")
		.replaceAll("\\~", "~")
		.replaceAll("\\#", "#")
		.replaceAll("\\>", ">")
		.replaceAll("\\*", "*");
}
