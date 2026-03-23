import { isParamListItemIdentifier } from "@/composables/useCommands";
import type { CommandContext, CommandDef } from "@/types/command";

// Internal storage for named buffers
const buffers = new Map<string, string[]>();

export const bufCmd: CommandDef = {
	description:
		"Manage named text buffers.\n" +
		"Usage: BUF ; list all buffers\n" +
		"BUF PUSH <\u200bname> [text] ; add line\n" +
		"BUF FLUSH <\u200bname> [delimiter?] ; ouput buffer lines\n" +
		"BUF CLEAR <\u200bname> ; clear buffer",
	paramDef: ["name?", "name?", "rest"],
	group: "Streams",
	fn: ({ params }: CommandContext) => {
		if (params.length === 0) {
			if (buffers.size === 0) return "No buffers defined.";
			const lines = ["| Name | Lines |", "|---|---|"];
			for (const [key, val] of buffers.entries()) lines.push(`| ${key} | ${val.length} |`);
			return { content: lines.join("\n"), format: "markdown" };
		}

		if (!params[1]) throw new Error("Buffer name is required.");
		const name = isParamListItemIdentifier(params[1]) ? params[1].text : String(params[1]);

		const subcmd = (isParamListItemIdentifier(params[0]) ? params[0].text : String(params[0])).toUpperCase();
		const content = params[2];

		switch (subcmd) {
			case "PUSH": {
				if (content === undefined || content === null)
					throw new Error(`No content provided to push to buffer '${name}'.`);

				if (!buffers.has(name)) buffers.set(name, []);

				const buffer = buffers.get(name)!;
				// Handle different content types gracefully
				const text = typeof content === "object" ? JSON.stringify(content) : String(content);
				buffer.push(text);

				return `Pushed to buffer '${name}'. (Size: ${buffer.length})`;
			}
			case "FLUSH": {
				const buffer = buffers.get(name);
				if (!buffer) throw new Error(`Buffer '${name}' did not exist.`);
				if (buffer.length === 0) return "";
				const delimiter = content !== undefined ? String(content) : "\n";
				return buffer.join(delimiter);
			}
			case "CLEAR": {
				if (buffers.delete(name)) return `Buffer '${name}' cleared.`;
				throw new Error(`Buffer '${name}' did not exist.`);
			}
			default:
				throw new Error(`Unknown subcommand '${subcmd}'. Expected: PUSH, FLUSH, CLEAR.`);
		}
	},
};
