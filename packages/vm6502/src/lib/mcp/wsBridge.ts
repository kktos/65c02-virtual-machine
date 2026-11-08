// WebSocket transport to the local vm6502-mcp server (see packages/vm6502-mcp).
// The page is the WS client; on connect it advertises the tool registry, then executes
// the calls it receives.
//
// Protocol:
//   page → server  { hello: { machine, tools: McpToolDescriptor[] } }   (on connect and on machine change)
//   server → page  { id, method: "call_tool", params: { name, args } }
//   page → server  { id, result: string | { content: McpContent[] } } | { id, error: string }
//                  (a string is text; `content` blocks, e.g. an image, are passed on to the agent as they are)

import { watch } from "vue";
import { useMachine } from "@/composables/useMachine";
import { findTool, getToolDescriptors } from "./tools";

export const DEFAULT_MCP_PORT = 6502;
const MAX_RETRY_DELAY = 3000;

let started = false;

export function startWsBridge(port = DEFAULT_MCP_PORT) {
	if (started) return;
	started = true;

	let retryDelay = 1000;
	let socket: WebSocket | null = null;
	const { selectedMachine } = useMachine();

	const sendHello = () => {
		if (socket?.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ hello: { machine: selectedMachine.value.name, tools: getToolDescriptors() } }));
	};

	const handleCall = async (ws: WebSocket, msg: { id: number; method: string; params?: Record<string, unknown> }) => {
		try {
			if (msg.method !== "call_tool") throw new Error(`Unknown method: ${msg.method}`);
			const name = String(msg.params?.name);
			const tool = findTool(name);
			if (!tool) throw new Error(`Unknown tool: ${name}`);
			const args = (msg.params?.args ?? {}) as Record<string, unknown>;
			const result = await tool.execute(args, {});
			ws.send(JSON.stringify({ id: msg.id, result }));
		} catch (e) {
			ws.send(JSON.stringify({ id: msg.id, error: e instanceof Error ? e.message : String(e) }));
		}
	};

	const connect = () => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}`);
		socket = ws;

		ws.onopen = () => {
			retryDelay = 1000;
			console.info(`[mcp] connected to ws://127.0.0.1:${port}`);
			sendHello();
		};

		ws.onmessage = (event) => {
			let msg: { id: number; method: string; params?: Record<string, unknown> };
			try {
				msg = JSON.parse(event.data as string);
			} catch {
				return console.warn("[mcp] bad message", event.data);
			}
			void handleCall(ws, msg);
		};

		ws.onclose = (event) => {
			if (event.code === 4000) return console.info("[mcp] replaced by another emulator tab");
			setTimeout(connect, retryDelay);
			retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
		};
	};

	connect();

	// Keep the server informed when the user switches machine
	watch(selectedMachine, sendHello);
}
