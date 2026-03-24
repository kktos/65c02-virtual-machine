import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import type { CommandResult, ParamListItem } from "@/types/command";

// Internal storage for named buffers
const buffers = new Map<string, string[]>();

export const bufCmd = defineCommand({
	description:
		"Manage named text buffers.\n" +
		"Usage: BUF ; list all buffers\n" +
		"BUF PUSH <\u200bname> [text] ; add line\n" +
		"BUF FLUSH <\u200bname> [delimiter?] ; ouput buffer lines\n" +
		"BUF CLEAR <\u200bname> ; clear buffer",
	paramDef: ["name?", "name?", "rest"],
	options: [{ name: "noclear" }] as const,
	group: "Streams",
	fn: ({ params, opts }) => {
		if (params.length === 0) return listBuffers();

		if (!params[1]) throw new Error("Buffer name is required.");

		const name = isParamListItemIdentifier(params[1]) ? params[1].text : String(params[1]);
		const subcmd = isParamListItemIdentifier(params[0]) ? params[0].text : String(params[0]);
		switch (subcmd.toUpperCase()) {
			case "PUSH":
				return push(name, params[2]);
			case "FLUSH":
				return flush(name, params[2], opts.noclear);
			case "CLEAR":
				return clear(name);
			default:
				throw new Error(`Unknown subcommand '${subcmd}'. Expected: PUSH, FLUSH, CLEAR.`);
		}
	},
});

function listBuffers(): CommandResult {
	if (buffers.size === 0) return "No buffers defined.";
	const lines = ["| Name | Lines |", "|---|---|"];
	for (const [key, val] of buffers.entries()) lines.push(`| ${key} | ${val.length} |`);
	return { content: lines.join("\n"), format: "markdown" };
}

function push(name: string, content: ParamListItem | undefined): CommandResult {
	if (content === undefined) throw new Error(`No content provided to push to buffer '${name}'.`);

	if (!buffers.has(name)) buffers.set(name, []);

	const buffer = buffers.get(name)!;
	// Handle different content types gracefully
	const text = typeof content === "object" ? JSON.stringify(content) : String(content);
	buffer.push(text);

	return `Pushed to buffer '${name}'. (Size: ${buffer.length})`;
}

function flush(name: string, content: ParamListItem | undefined, noclear: boolean): CommandResult {
	const buffer = buffers.get(name);
	if (!buffer) throw new Error(`Buffer '${name}' did not exist.`);
	if (buffer.length === 0) {
		if (!noclear) buffers.delete(name);
		return "";
	}
	const delimiter = content !== undefined ? String(content) : "\n";
	const ouput = buffer.join(delimiter);
	if (!noclear) buffers.delete(name);
	return ouput;
}

function clear(name: string): CommandResult {
	if (buffers.delete(name)) return `Buffer '${name}' cleared.`;
	throw new Error(`Buffer '${name}' did not exist.`);
}
