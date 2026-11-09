import "fake-indexeddb/auto";
import { marked } from "marked";
import { describe, expect, it, vi } from "vitest";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { listCmd } = await import("../list.cmd");
const { useRoutines } = await import("@/composables/useRoutines");
const { useCommands, parseStoredHistory } = await import("@/composables/useCommands");

const listLines = async (...names: string[]) => {
	const ctx = {
		params: names.map((text) => ({ text, value: undefined })),
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

		const html = await listLines("routines", "dump");

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

describe("command history", () => {
	const { runCommand, commandHistory } = useCommands();
	const vm = {} as VirtualMachine;

	it("records who ran a command and when, a repeat only refreshing the time", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			commandHistory.value = [];
			vi.setSystemTime(new Date(2026, 10, 9, 8, 0, 0));
			await runCommand("print 1", vm, { source: "mcp" });
			vi.setSystemTime(new Date(2026, 10, 9, 8, 0, 5));
			await runCommand("print 1", vm, { source: "mcp" });
			await runCommand("print 1", vm);

			expect(commandHistory.value).toEqual([
				{ cmd: "print 1", source: "mcp", time: new Date(2026, 10, 9, 8, 0, 5).getTime() },
				{ cmd: "print 1", source: "user", time: new Date(2026, 10, 9, 8, 0, 5).getTime() },
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("LIST HISTORY shows the date and time, the source and the command cut at 40 characters", async () => {
		const nov9 = new Date(2026, 10, 9, 9, 5, 7).getTime();
		commandHistory.value = [
			{ cmd: "d $300", source: "user" },
			{ cmd: "hd $300 $3ff |> tr text |> sed //x// \"$1\" |> write a.txt", source: "mcp", time: nov9 },
			{ cmd: "asm $300\nlda #1\nend", source: "bp", time: new Date(2026, 0, 2, 3, 4, 5).getTime() },
			{ cmd: "say `hi`", source: "init", time: nov9 },
		];

		const html = await listLines("history");
		const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/gs)]
			.slice(1)
			.map((row) => [...row[1]!.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((cell) => cell[1]));

		expect(rows).toEqual([
			["1", "", "user", "<code>d $300</code>"],
			["2", "2026-11-09 09:05:07", "mcp", "<code>hd $300 $3ff |&gt; tr text |&gt; sed //x// &quot;$1…</code>"],
			["3", "2026-01-02 03:04:05", "bp", "<code>asm $300 ↵ lda #1 ↵ end</code>"],
			["4", "2026-11-09 09:05:07", "init", "<code>say `hi`</code>"],
		]);
	});

	it("reads the history saved before entries had a source and a time", () => {
		expect(parseStoredHistory(JSON.stringify(["d $300", { cmd: "m 0", source: "mcp", time: 1 }, 42]))).toEqual([
			{ cmd: "d $300", source: "user" },
			{ cmd: "m 0", source: "mcp", time: 1 },
		]);
		expect(parseStoredHistory("not json")).toEqual([]);
	});
});
