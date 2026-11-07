import { afterEach, describe, expect, it, vi } from "vitest";

// The real registry pulls in the whole VM; the adapter only needs its shape.
const execute = vi.fn(async (input: Record<string, unknown>) => `got ${JSON.stringify(input)}`);
vi.mock("@/lib/mcp/tools", () => ({
	MCP_TOOLS: [
		{
			name: "read_memory",
			description: "Read memory",
			inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
			annotations: { readOnlyHint: true },
			execute,
		},
		{ name: "pause", description: "Pause", inputSchema: { type: "object", properties: {} }, execute },
	],
}));

const { registerWebMcpTools, isWebMcpSupported } = await import("@/lib/mcp/webmcp");

type Registered = { tool: Record<string, unknown> & { execute: Function }; signal?: AbortSignal };

const installModelContext = (target: object) => {
	const registered: Registered[] = [];
	Object.defineProperty(target, "modelContext", {
		configurable: true,
		value: { registerTool: vi.fn(async (tool, opts) => void registered.push({ tool, signal: opts?.signal })) },
	});
	return registered;
};

describe("WebMCP adapter", () => {
	afterEach(() => {
		delete (globalThis.document as unknown as Record<string, unknown>)?.modelContext;
		delete (globalThis.navigator as unknown as Record<string, unknown>)?.modelContext;
		execute.mockClear();
	});

	it("does nothing when the browser has no modelContext", async () => {
		vi.stubGlobal("document", {});
		expect(isWebMcpSupported()).toBe(false);
		expect(await registerWebMcpTools()).toBeUndefined();
	});

	it("registers every tool with its schema and annotations on document.modelContext", async () => {
		vi.stubGlobal("document", {});
		const registered = installModelContext(document);

		await registerWebMcpTools();

		expect(registered.map((r) => r.tool.name)).toEqual(["read_memory", "pause"]);
		expect(registered[0]?.tool).toMatchObject({
			description: "Read memory",
			inputSchema: { type: "object", required: ["address"] },
			annotations: { readOnlyHint: true },
		});
	});

	it("falls back to navigator.modelContext (pre-2026 entry point)", async () => {
		vi.stubGlobal("document", {});
		vi.stubGlobal("navigator", {});
		const registered = installModelContext(navigator);

		await registerWebMcpTools();

		expect(registered).toHaveLength(2);
	});

	it("delegates execution to the registry, forwarding the abort signal", async () => {
		vi.stubGlobal("document", {});
		const registered = installModelContext(document);
		await registerWebMcpTools();

		const signal = new AbortController().signal;
		const result = await registered[0]?.tool.execute({ address: "$300" }, { signal });

		expect(result).toBe('got {"address":"$300"}');
		expect(execute).toHaveBeenCalledWith({ address: "$300" }, { signal });
	});

	it("unregisters all tools through the shared AbortSignal", async () => {
		vi.stubGlobal("document", {});
		const registered = installModelContext(document);

		const unregister = await registerWebMcpTools();
		expect(registered.every((r) => r.signal && !r.signal.aborted)).toBe(true);

		unregister?.();
		expect(registered.every((r) => r.signal?.aborted)).toBe(true);
	});
});
