# MCP server for the emulator — TODO

Goal: let an agent (Claude Code, etc.) drive the emulator — debugger, metadata, I/O —
instead of the app pushing a snapshot to an LLM (`explain` / Gemini).

## Use cases

1. **Reverse-engineering Apple II software** (strongest case)
   Agent pulls what it needs: follows JSRs, checks xrefs, reads memory at runtime,
   sets BPs to observe inputs, and writes findings back as labels / comments / `.db` formats.
   The metadata store becomes the shared work product ("annotate this disk's boot loader").
2. **Dynamic debugging / hunting**
   - find the lives counter: snapshot → play → diff → narrow (cheat-finder loop)
   - find the copy-protection check: BP on `$C0xx` disk accesses, trace back
   - prototype the "BP on HIRES access → identify game → apply patch" idea from TODO.md
3. **Emulator dev loop**
   Boot disk, type keys, read the text screen as text (decode `$400–$7FF`), run Klaus suite,
   check that a bus/video change didn't regress. Much cheaper and more reliable than
   Chrome-automation clicking and screenshots.
4. **Writing 6502 code**
   assemble → load → run until BP → inspect regs/mem → fix, in a loop.

## Architecture

- [x] **Bridge first**: Node MCP server (stdio) + WebSocket on localhost; the browser tab
      connects to it and executes requests. Agent and user share the same machine state;
      metadata stays in IndexedDB.
- [x] **Single tool registry** in the app (`src/lib/mcp/tools.ts`); transports only adapt it.
      The Node server is a thin relay (tools advertised by the tab, `tools/list_changed`, cached list).
- [x] **WebMCP** adapter (`src/lib/mcp/webmcp.ts`): registers the registry on `document.modelContext`
      (fallback `navigator.modelContext`) when available. Unit-tested with a mock; not tried in a
      real browser yet (needs the Chrome flag / origin trial).
- [ ] **Headless later** (optional): run CPU + bus in Node for CI / batch. Requires decoupling
      commands from Vue composables (`useMachine`, `useGemini`, …).

## Tools

MVP:
- [x] `exec_command(line)` — reuse the whole command language
- [x] `read_memory(addr, len)` — structured (hex / bytes)
- [x] `screen_text()` — decode Apple II text page to plain text
- [x] `run_until({ pc | bp | cycles, timeout })` — **blocks** until pause, returns state
- [x] `type_keys(text)`

Next:
- [x] `get_registers`, `pause`, `status`
- [ ] `step(n)`, `reset`
- [ ] `write_memory`
- [ ] `disassemble(range)` — paginated, JSON
- [ ] `set_breakpoint` / `remove_breakpoint` / list
- [ ] labels / comments / data-format CRUD
- [ ] `screenshot` (HIRES / GR) as image
- [ ] memory snapshot + diff (cheat-finder)
- [ ] MCP resources: memory map, current disk symbols

## Done so far

- `packages/vm6502-mcp` (Node, stdio MCP + WS server on 127.0.0.1:6502) — see its README
- `src/lib/mcp/`: `tools.ts` (registry), `wsBridge.ts` (opt-in with `?mcp`, auto-reconnect),
  `webmcp.ts`, `index.ts` (`startMcp()`, called from `main.ts`)
- addresses accept labels (`KEYIN`, `ns::label`) as well as `$C000` / `0xC000` / numbers
- Tested end to end against the real app (boot, registers, screen, disasm, run_until)

## Follow-ups noticed

- [x] `run_until` reports *why* it stopped. The worker sends a `StopInfo` (`src/types/stopinfo.interface.ts`)
      in the `isRunning: false` message; the VM keeps it as `vm.lastStop` (BRK + hypercall byte → `hypercall`).
      `run_until` returns `reached_address` / `breakpoint` (type + address) / `brk` / `step` / `error` /
      `pause` / `reset`, keeps waiting through hypercalls; `get_registers` adds `last_stop`.
- [ ] a breakpoint whose command resumes the machine still ends `run_until` (it reports that breakpoint)
- [ ] `run_until` `cycles` limit (needs worker support)
- [ ] text screen decoder lives in the bridge; move it to the machine (e.g. `bus.getTextScreen()`)
- [x] booting the //e from reset stopped on BRK at $0003 (A=$2F X=$42): not expected. The SmartPort card's
      boot code (slot 5) got error $2F (no disk), its `BCS` landed inside `JMP $0801`, then hit an `RTS` with
      nothing to return to (the slot scan enters with `JMP ($0000)`) → $0001 → BRK. Its error path now resumes
      the slot scan ($FABA) like real boot ROMs, or cold-starts BASIC when not called by the scan.
      `src/machines/apple2/tests/boot.test.ts` boots the real //e in Node.
- [ ] every BRK stops the CPU: `isHyperCallActive` is a constant `true` in `cpu.65c02.ts`, so the
      "break on BRK" toggle has no effect and a BRK never goes through the $FFFE vector
- [x] `exec_command` failed if the user's console was busy. Commands are now queued (`runCommand` in
      `useCommands`): every caller (console, breakpoint commands, init, MCP) waits for its turn and gets
      its own output. MCP refuses while the user's console is in multi-line mode, and closes a
      multi-line session it opened without its terminator.
- [x] `exec_command("bogus")` returned `$00/000B: 00` instead of an error: unknown commands fall
      through to the mini-monitor, whose hex tokenizer read `bogus` as `$B` + `ogus` and hex-dumped $B.
      The monitor now throws `Unknown command: …` for any word other than `G` / `L`, a register or a label.
- [ ] WebMCP: try it for real (enable the flag), check how long-running `run_until` behaves
- [ ] mark tools that change state (`write_memory`, …) with `consequentialHint` for WebMCP

## Pitfalls

- **Async execution**: free-running VM is useless to an agent — every "run" must block until a
  pause condition or timeout, then return state.
- **Output volume**: hexdump / disasm get big — cap and paginate.
- **Determinism**: save states would make experiments repeatable (restore → patch → compare).
- **Overlap with Gemini `explain`**: keep `explain` for quick in-app use; MCP for long investigations.
- **Security**: bind to localhost only; `write_memory` / `exec` = arbitrary control of the session.
