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

To add a tool: add an entry to `MCP_TOOLS` in `tools.ts`. Nothing to change here. A tool answers text,
or MCP content blocks (`{ content: [...] }`, e.g. an image) that the server passes on as they are.

**Files on the agent's machine**: a page can't read them, so a tool marks a string property of its schema
with `"x-vm6502-host-file": true` (`hostFileSchema` in `tools.ts`). The agent passes a path there; this
server reads the file (absolute, `~/…`, or relative to its working directory; max 64 MB) and sends
`{ name, path, size, data }` (data in base64) in its place (`src/hostFiles.ts`). `load_disk` and `load_binary`
use it.

## Setup (Claude Code)

```sh
claude mcp add vm6502 -- node /absolute/path/to/packages/vm6502-mcp/src/index.ts
```

Needs Node ≥ 22.18 (runs the TypeScript directly). Port: `VM6502_MCP_PORT` (default 6502). Tests: `npm test`.

Then run `pnpm dev` and open `http://localhost:5173/?mcp`.

## Tools

| Tool | What it does |
|---|---|
| `status` | Is a tab connected, which machine |
| `exec_command` | Run a debugger console line (the whole command language) and return its output |
| `read_memory` | Hex dump, debug read (no I/O side effects), max 4 KB |
| `write_memory` | Write bytes (array or hex string), debug write, max 4 KB; reports bytes that didn't take and the previous ones |
| `disassemble` | JSON disassembly with labels / comments / data formats; paginated (`count`, `end_address`, `next_address`) |
| `get_registers` | CPU registers, flags, running state |
| `screen_text` | Apple II text screen as text: the displayed one by default (page 1/2, 40/80 cols), with a header saying which |
| `screenshot` | The screen as a PNG image, as displayed (any video mode, border included; //e: 640x480) |
| `memory_snapshot` | Start a cheat-finder search: record memory ranges (default $0000-$BFFF), every byte a candidate |
| `memory_diff` | Keep the candidates that changed / stayed / increased / decreased (`by`) / equal a value; lists them |
| `read_log` | Lines of a log window (`hyper` = hypercall logs), with a cursor to get only new lines |
| `type_keys` | Type on the emulated keyboard (`\n` = Return) |
| `run_until` | Resume and **block** until a stop (BP, BRK, pause) or timeout; optional temp PC breakpoint |
| `pause` | Pause and return registers |
| `step` | Execute `count` instructions on the paused machine; stops early on a PC breakpoint, a stopping hypercall or an error |
| `reset` | Reset (CPU, soft switches, video; memory kept), left paused on the reset vector |
| `save_state` | Save the whole machine (registers, memory, soft switches, cards) under a name, in the tab |
| `restore_state` | Put a saved state back, machine left paused (restore → patch → run → compare) |
| `list_states` | The save states |
| `delete_state` | Delete one, or all with `all: true` |
| `get_trace` | Last executed instructions (disassembled, registers before each); `enable: true` starts recording |
| `list_disks` | The disk library (images kept in the browser) and what is in the drive |
| `load_disk` | Insert a library disk by key or name, or an image file from the agent's machine by `path` (added to the library); `boot: true` cold-boots it |
| `load_binary` | Write a file from the agent's machine into memory (address given, or from a `NAME#06AAAA` name); `set_pc: true` sets PC there |
| `eject_disk` | Empty the drive (stays empty at the next startup) |
| `set_breakpoint` | Add a PC / read / write / access breakpoint (address or range, optional hook command); idempotent |
| `remove_breakpoint` | Remove one (same type + address/range), or all with `all: true` |
| `list_breakpoints` | Breakpoints as JSON, optionally only those covering an address / overlapping a range |

See `../vm6502/MCP_TODO.md` for what's next.
