import "fake-indexeddb/auto";
import { marked } from "marked";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { listCmd } = await import("../list.cmd");
const { useRoutines } = await import("@/composables/useRoutines");

const listRoutine = async (name: string) => {
	const ctx = {
		params: [
			{ text: "routines", value: undefined },
			{ text: name, value: undefined },
		],
		opts: {},
	} as unknown as Parameters<typeof listCmd.fn>[0];
	const res = (await listCmd.fn(ctx)) as { content: string };
	return marked.parse(res.content) as string;
};

describe("LIST ROUTINES <name>", () => {
	it("shows the routine as one block of lines, without blank lines between them", async () => {
		useRoutines().setRoutine("dump", ["; a comment", "# not a heading", "- not a list", "print @a"].join("\n"), [
			"a",
		]);

		const html = await listRoutine("dump");

		expect(html.match(/<p>/g)).toHaveLength(1);
		expect(html).not.toMatch(/<h\d|<ul/);
		const lines = html
			.replace(/<\/?p>/g, "")
			.trim()
			.split(/<br\s*\/?>\n?/);
		expect(lines).toEqual([
			"routine dump @a",
			"  ; a comment",
			"  # not a heading",
			"  - not a list",
			"  print @a",
			"end",
		]);
	});
});
