// WebMCP transport: registers the tool registry with the browser so in-browser agents can call it.
// https://developer.chrome.com/docs/ai/webmcp/imperative-api
// Experimental (Chrome origin trial / flag). The entry point moved from `navigator.modelContext`
// to `document.modelContext` in 2026; both are probed.

import { MCP_TOOLS, type McpToolResult } from "./tools";

type WebMcpTool = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean };
	execute: (input: Record<string, unknown>, ctx?: { signal?: AbortSignal }) => Promise<McpToolResult>;
};

type ModelContext = {
	registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => unknown;
};

const getModelContext = (): ModelContext | undefined => {
	const candidates = [
		(document as unknown as { modelContext?: ModelContext }).modelContext,
		(navigator as unknown as { modelContext?: ModelContext }).modelContext,
	];
	return candidates.find((c) => typeof c?.registerTool === "function");
};

export const isWebMcpSupported = () => getModelContext() !== undefined;

/** Registers all tools. Returns a function that unregisters them, or undefined if WebMCP is unavailable. */
export async function registerWebMcpTools(): Promise<(() => void) | undefined> {
	const modelContext = getModelContext();
	if (!modelContext) return undefined;

	const controller = new AbortController();
	for (const tool of MCP_TOOLS) {
		try {
			await modelContext.registerTool(
				{
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema,
					annotations: tool.annotations,
					execute: (input, ctx) => tool.execute(input ?? {}, { signal: ctx?.signal }),
				},
				{ signal: controller.signal },
			);
		} catch (e) {
			console.warn(`[webmcp] could not register ${tool.name}`, e);
		}
	}
	console.info(`[webmcp] registered ${MCP_TOOLS.length} tools`);
	return () => controller.abort();
}
