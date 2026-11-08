import { describe, expect, it, vi } from "vitest";
import { marked } from "marked";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { cmdHelp } = await import("../help.cmd");

/** Renders `HELP <name>` the way the console does and returns the text of each cell of that command's row. */
const helpRowCells = async (name: string) => {
	const ctx = { params: [{ text: name, value: undefined }], opts: {} } as unknown as Parameters<typeof cmdHelp.fn>[0];
	const res = await cmdHelp.fn(ctx);
	const html = marked.parse((res as { content: string }).content) as string;
	const row = html.split("<tr>").find((r) => r.includes(`<td>${name}</td>`));
	if (!row) throw new Error(`No help row for ${name}`);
	return [...row.matchAll(/<td>(.*?)<\/td>/gs)].map((m) => m[1]!);
};

describe("HELP table", () => {
	it("keeps a paramHelp containing pipes in its own cell", async () => {
		const [, params, description] = await helpRowCells("LIST");
		expect(params).toBe("hooks|routines [name]|history|buffers|breakpoints [address|range]");
		expect(description).toContain("breakpoints");
	});

	it("does not let <placeholders> in paramHelp turn into HTML tags", async () => {
		const [, params] = await helpRowCells("HELP");
		expect(params).toBe("[command] | --group &lt;group&gt;");
	});

	it("still escapes the pipes of auto-generated param lists", async () => {
		const [, params] = await helpRowCells("BP");
		expect(params).toBe("range|address");
	});
});
