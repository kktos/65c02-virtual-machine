#!/usr/bin/env node
// MCP server for the vm6502 emulator: a thin relay.
// Speaks MCP over stdio to the agent and forwards tool calls over a local WebSocket to the
// emulator tab (opened with `?mcp` in its URL). The tools themselves are defined by the page
// (packages/vm6502/src/lib/mcp/tools.ts); only `status` is local.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { BrowserBridge, log } from "./bridge.ts";

const PORT = Number(process.env.VM6502_MCP_PORT ?? 6502);

const bridge = new BrowserBridge(PORT);
bridge.start();

const server = new Server(
	{ name: "vm6502", version: "0.0.2" },
	{
		capabilities: { tools: { listChanged: true } },
		instructions:
			"Drives the vm6502 6502/65C02 emulator (Apple //e, …) running in a browser tab. " +
			"The tab must be opened with ?mcp in its URL; call `status` if tools fail.",
	},
);

const statusTool: Tool = {
	name: "status",
	description: "Is an emulator tab connected, which machine is loaded, which tools it provides.",
	inputSchema: { type: "object", properties: {} },
	annotations: { readOnlyHint: true },
};

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [statusTool, ...(bridge.tools as Tool[])],
}));

server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
	if (params.name === statusTool.name) return text(JSON.stringify(bridge.status, null, 2));
	if (!bridge.tools.some((t) => t.name === params.name) && bridge.status.connected)
		return text(`Unknown tool: ${params.name}`, true);
	try {
		return text(await bridge.callTool(params.name, params.arguments ?? {}));
	} catch (e) {
		return text(e instanceof Error ? e.message : String(e), true);
	}
});

bridge.on("toolsChanged", () => {
	server.sendToolListChanged().catch((e: unknown) => log("could not notify tool list change", e));
});

await server.connect(new StdioServerTransport());
