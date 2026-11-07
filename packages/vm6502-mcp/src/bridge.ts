// WebSocket bridge between the MCP server (Node) and the emulator running in a browser tab.
// The browser is the WS client (a page cannot listen); it connects with `?mcp` in its URL.
//
// Protocol:
//   page → server  { hello: { machine, tools } }   (on connect and on machine change)
//   server → page  { id, method: "call_tool", params: { name, args } }
//   page → server  { id, result: string } | { id, error: string }
//
// The tools are defined by the page (src/lib/mcp/tools.ts in vm6502). The last advertised list is
// cached on disk so the server can list tools before the tab connects (or while it reloads).

import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";

export type ToolDescriptor = {
	name: string;
	description: string;
	inputSchema: { type: "object"; [k: string]: unknown };
	annotations?: { readOnlyHint?: boolean };
};

type Pending = { resolve: (v: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

const CACHE_FILE = join(homedir(), ".cache", "vm6502-mcp", "tools.json");

export const log = (...args: unknown[]) => console.error("[vm6502-mcp]", ...args); // stdout is the MCP channel

export class BrowserBridge extends EventEmitter<{ toolsChanged: []; connected: [] }> {
	private client: WebSocket | null = null;
	private machine = "";
	private nextId = 1;
	private pending = new Map<number, Pending>();
	private listenError: string | null = null;
	private readonly port: number;
	tools: ToolDescriptor[] = [];

	constructor(port: number) {
		super();
		this.port = port;
		try {
			this.tools = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as ToolDescriptor[];
		} catch {
			// no cache yet: tools appear when a tab connects
		}
	}

	start() {
		const wss = new WebSocketServer({ host: "127.0.0.1", port: this.port });
		wss.on("listening", () => log(`waiting for the emulator on ws://127.0.0.1:${this.port}`));
		wss.on("error", (err: NodeJS.ErrnoException) => {
			this.listenError =
				err.code === "EADDRINUSE"
					? `port ${this.port} already in use (another vm6502-mcp running?)`
					: `bridge error: ${err.message}`;
			log(this.listenError);
		});
		wss.on("connection", (ws) => this.attach(ws));
	}

	get status() {
		if (this.listenError) return { connected: false, reason: this.listenError };
		if (!this.client) return { connected: false, reason: "no emulator tab connected" };
		return { connected: true, machine: this.machine, tools: this.tools.map((t) => t.name) };
	}

	private setTools(tools: ToolDescriptor[]) {
		if (JSON.stringify(tools) === JSON.stringify(this.tools)) return;
		this.tools = tools;
		try {
			mkdirSync(dirname(CACHE_FILE), { recursive: true });
			writeFileSync(CACHE_FILE, JSON.stringify(tools, null, 2));
		} catch (e) {
			log("could not cache the tool list", e);
		}
		log(`tools: ${tools.map((t) => t.name).join(", ")}`);
		this.emit("toolsChanged");
	}

	private attach(ws: WebSocket) {
		// Only one emulator tab drives the session: the newest one wins.
		if (this.client) {
			log("new emulator tab connected, dropping the previous one");
			this.client.close(4000, "replaced");
		}
		this.client = ws;
		log("emulator connected");
		this.emit("connected");

		ws.on("message", (raw) => {
			let msg: {
				id?: number;
				result?: string;
				error?: string;
				hello?: { machine: string; tools?: ToolDescriptor[] };
			};
			try {
				msg = JSON.parse(raw.toString());
			} catch {
				return log("bad message from browser");
			}
			if (msg.hello) {
				this.machine = msg.hello.machine;
				log(`machine: ${this.machine}`);
				if (Array.isArray(msg.hello.tools)) this.setTools(msg.hello.tools);
				return;
			}
			if (msg.id === undefined) return;
			const p = this.pending.get(msg.id);
			if (!p) return;
			this.pending.delete(msg.id);
			clearTimeout(p.timer);
			if (msg.error !== undefined) p.reject(new Error(msg.error));
			else p.resolve(String(msg.result ?? ""));
		});

		ws.on("close", () => {
			if (this.client !== ws) return;
			this.client = null;
			this.machine = "";
			log("emulator disconnected");
			for (const [id, p] of this.pending) {
				clearTimeout(p.timer);
				p.reject(new Error("emulator disconnected"));
				this.pending.delete(id);
			}
		});
	}

	/** Resolves once a tab is connected; tolerates page reloads (HMR, F5) during a session. */
	private waitForClient(ms: number): Promise<WebSocket> {
		if (this.client) return Promise.resolve(this.client);
		if (this.listenError) return Promise.reject(new Error(this.listenError));
		return new Promise((resolve, reject) => {
			const onConnected = () => {
				clearTimeout(timer);
				resolve(this.client as WebSocket);
			};
			const timer = setTimeout(() => {
				this.off("connected", onConnected);
				reject(new Error("no emulator tab connected. Open the emulator with ?mcp in the URL."));
			}, ms);
			this.once("connected", onConnected);
		});
	}

	/** Calls a page tool. The timeout is a safety net: tools enforce their own (run_until ≤ 120s). */
	async callTool(name: string, args: Record<string, unknown>, timeoutMs = 150_000): Promise<string> {
		const client = await this.waitForClient(10_000);

		const id = this.nextId++;
		return new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`${name}: no answer from the emulator after ${timeoutMs}ms`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			client.send(JSON.stringify({ id, method: "call_tool", params: { name, args } }));
		});
	}
}
