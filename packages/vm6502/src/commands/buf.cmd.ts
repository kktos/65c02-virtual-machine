import { isParamListItemIdentifier } from "@/composables/useCommands";
import type { Command, CommandContext } from "@/types/command";

// Internal storage for named buffers
const buffers = new Map<string, string[]>();

export const bufCmd: Command = {
	description: "Manage named text buffers. Usage: BUF <PUSH|FLUSH|CLEAR> <\u200bname> [text]",
	paramDef: ["name", "name", "rest?"],
	group: "System",
	fn: ({ params }: CommandContext) => {
		const name = isParamListItemIdentifier(params[1]) ? params[1].text : String(params[1]);
		if (!name) throw new Error("Buffer name is required.");

		const subcmd = (isParamListItemIdentifier(params[0]) ? params[0].text : String(params[0])).toUpperCase();
		const content = params[2];

		switch (subcmd) {
			case "PUSH": {
				if (content === undefined || content === null)
					return `No content provided to push to buffer '${name}'.`;

				if (!buffers.has(name)) buffers.set(name, []);

				const buffer = buffers.get(name)!;
				// Handle different content types gracefully
				const text = typeof content === "object" ? JSON.stringify(content) : String(content);
				buffer.push(text);

				return `Pushed to buffer '${name}'. (Size: ${buffer.length})`;
			}
			case "FLUSH": {
				const buffer = buffers.get(name);
				if (!buffer || buffer.length === 0) return "";
				return buffer.join("\n");
			}
			case "CLEAR": {
				if (buffers.delete(name)) return `Buffer '${name}' cleared.`;
				return `Buffer '${name}' did not exist.`;
			}
			default:
				throw new Error(`Unknown subcommand '${subcmd}'. Expected: PUSH, FLUSH, CLEAR.`);
		}
	},
};
