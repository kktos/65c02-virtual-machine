import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({}) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { findTool } = await import("@/lib/mcp/tools");
const { useLogWindows } = await import("@/composables/useLogWindows");

const readLog = (input: Record<string, unknown> = {}) =>
	findTool("read_log")!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

// Log windows are module state: each test uses its own window names.
let n = 0;
let name: string;
const trace = (...lines: string[]) => lines.forEach((l) => useLogWindows().trace(name, l));

describe("read_log", () => {
	beforeEach(() => {
		name = `win${n++}`;
	});

	it("without a name, lists the windows", async () => {
		trace("a", "b");
		const { windows } = await readLog();
		expect(windows).toContainEqual({ name, lines: 2, visible: true });
	});

	it("a window that doesn't exist yet: no lines, not an error", async () => {
		expect(await readLog({ name: "hyper-not-yet" })).toMatchObject({
			lines: [],
			cursor: -1,
			note: expect.any(String),
		});
		expect(await readLog({ name: "hyper-not-yet", after: 7 })).toMatchObject({ cursor: 7 });
	});

	it("returns the lines and a cursor that gives only the new ones next time", async () => {
		trace("one", "two");
		const first = await readLog({ name });
		expect(first.lines).toEqual(["one", "two"]);

		expect(await readLog({ name, after: first.cursor })).toMatchObject({ lines: [], cursor: first.cursor });

		trace("three");
		const next = await readLog({ name, after: first.cursor });
		expect(next).toEqual({ name, lines: ["three"], cursor: first.cursor + 1 });
	});

	it("pages with `limit` and `more`", async () => {
		trace("1", "2", "3", "4", "5");
		const page1 = await readLog({ name, limit: 2 });
		expect(page1).toMatchObject({ lines: ["1", "2"], more: true });
		const page2 = await readLog({ name, limit: 2, after: page1.cursor });
		expect(page2).toMatchObject({ lines: ["3", "4"], more: true });
		const page3 = await readLog({ name, limit: 2, after: page2.cursor });
		expect(page3.lines).toEqual(["5"]);
		expect(page3.more).toBeUndefined();
	});

	it("says when lines after the cursor are gone (window cleared or overflowed)", async () => {
		trace("old");
		const { cursor } = await readLog({ name });
		trace("lost");
		useLogWindows().clear(name);
		trace("new");
		expect(await readLog({ name, after: cursor })).toMatchObject({ lines: ["new"], dropped: true });
	});

	it("rejects bad input", async () => {
		await expect(readLog({ name: 42 })).rejects.toThrow("name: string expected");
		await expect(readLog({ name, limit: 0 })).rejects.toThrow("limit: must be between 1 and 500");
		await expect(readLog({ name, after: -2 })).rejects.toThrow("after: must be between");
	});
});
