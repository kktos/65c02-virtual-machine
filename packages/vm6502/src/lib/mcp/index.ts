// Exposes the agent tool registry (./tools) through the available transports:
// - WebSocket bridge to the local vm6502-mcp server: opt-in with `?mcp` or `?mcp=<port>` in the URL
// - WebMCP: whenever the browser supports it

import { DEFAULT_MCP_PORT, startWsBridge } from "./wsBridge";
import { registerWebMcpTools } from "./webmcp";

export function startMcp() {
	const param = new URLSearchParams(window.location.search).get("mcp");
	if (param !== null) startWsBridge(Number(param) || DEFAULT_MCP_PORT);

	void registerWebMcpTools();
}
