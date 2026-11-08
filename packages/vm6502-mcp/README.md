# vm6502-mcp

MCP server that lets an agent drive the vm6502 emulator running in a browser tab.

```
agent ──stdio/MCP──▶ vm6502-mcp ──ws://127.0.0.1:6502──▶ emulator tab (?mcp)
```

This server is a thin relay: **the tools are defined by the app**, in
`packages/vm6502/src/lib/mcp/tools.ts` (one registry, JSON Schemas included). The tab advertises
them when it connects and the server sends `tools/list_changed`. The last list is cached in
`~/.cache/vm6502-mcp/tools.json`, so tools are listed even before the tab is open. Only `status`
is local. Calls wait up to 10s for a tab to (re)connect, so page reloads don't break a session.

The same registry is also exposed through [WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
(`src/lib/mcp/webmcp.ts`) when the browser supports it, for in-browser agents.

The browser is the WebSocket client, so the bridge is opt-in: open the app with `?mcp`
(or `?mcp=<port>`). The newest connected tab wins. The server only listens on 127.0.0.1.

To add a tool: add an entry to `MCP_TOOLS` in `tools.ts`. Nothing to change here.

## Setup (Claude Code)

```sh
claude mcp add vm6502 -- node /absolute/path/to/packages/vm6502-mcp/src/index.ts
```

Needs Node ≥ 22.18 (runs the TypeScript directly). Port: `VM6502_MCP_PORT` (default 6502).

Then run `pnpm dev` and open `http://localhost:5173/?mcp`.

## Tools

| Tool | What it does |
|---|---|
| `status` | Is a tab connected, which machine |
| `exec_command` | Run a debugger console line (the whole command language) and return its output |
| `read_memory` | Hex dump, debug read (no I/O side effects), max 4 KB |
| `get_registers` | CPU registers, flags, running state |
| `screen_text` | Apple II text screen as text (page 1/2, 40/80 cols) |
| `read_log` | Lines of a log window (`hyper` = hypercall logs), with a cursor to get only new lines |
| `type_keys` | Type on the emulated keyboard (`\n` = Return) |
| `run_until` | Resume and **block** until a stop (BP, BRK, pause) or timeout; optional temp PC breakpoint |
| `pause` | Pause and return registers |

See `../vm6502/MCP_TODO.md` for what's next.
