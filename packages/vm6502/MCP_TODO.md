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
- [x] text screen decoder lived in the bridge; it's now the machine's: `IBus.getTextScreen({ page, cols })`,
      implemented by `AppleBus` (`src/machines/apple2/video/text.screen.ts`). `screen_text` asks the bus
      (no more machine-name check) and the //e boot test uses it too.
- [x] booting the //e from reset stopped on BRK at $0003 (A=$2F X=$42): not expected. The SmartPort card's
      boot code (slot 5) got error $2F (no disk), its `BCS` landed inside `JMP $0801`, then hit an `RTS` with
      nothing to return to (the slot scan enters with `JMP ($0000)`) → $0001 → BRK. Its error path now resumes
      the slot scan ($FABA) like real boot ROMs, or cold-starts BASIC when not called by the scan.
      `src/machines/apple2/tests/boot.test.ts` boots the real //e in Node.
- [x] every BRK stopped the CPU: `isHyperCallActive` was a constant `true` in `cpu.65c02.ts`, so the
      "break on BRK" toggle had no effect, a BRK never went through $FFFE, stepping stayed stuck on it,
      and `BRK $01-$04` in real software ran as a hypercall. The worker now decides: hypercall (only if
      the machine sets `hypercalls: true`; the //e does, Klaus doesn't) → stop as `hypercall`; else
      break on BRK (on by default; toolbar or `brk on|off`) and running → stop as `brk`, and resuming
      executes it; else a real BRK through $FFFE, with B set in the pushed P. Stepping always executes
      it. The disassembler only decodes hypercalls on machines that have them.
- [x] hypercalls without stopping the CPU, and `BRK $8x` to stop after one — see "Hypercalls: run them
      without a stop" below
- [x] `exec_command` failed if the user's console was busy. Commands are now queued (`runCommand` in
      `useCommands`): every caller (console, breakpoint commands, init, MCP) waits for its turn and gets
      its own output. MCP refuses while the user's console is in multi-line mode, and closes a
      multi-line session it opened without its terminator.
- [x] `exec_command("bogus")` returned `$00/000B: 00` instead of an error: unknown commands fall
      through to the mini-monitor, whose hex tokenizer read `bogus` as `$B` + `ogus` and hex-dumped $B.
      The monitor now throws `Unknown command: …` for any word other than `G` / `L`, a register or a label.
- [x] the agent couldn't read log windows (hypercall logs go to the `hyper` window, `log <name>` to
      others): `read_log({ name?, after?, limit? })` returns the lines and a `cursor`; passed back as
      `after`, only the new lines come. No `name` lists the windows; a window not created yet (`hyper`
      before the first hypercall log) gives no lines, not an error; `dropped` / `more` flags.
- [ ] WebMCP: try it for real (enable the flag), check how long-running `run_until` behaves
- [ ] mark tools that change state (`write_memory`, …) with `consequentialHint` for WebMCP

## Hypercalls: run them without a stop (done)

Before, a hypercall was a round trip: the worker stops the CPU (`isRunning: false`, reason `hypercall`)
and posts `hypercall`; the main thread (`executeHypercallCmd`) reads the arguments from memory, does
the work (log line, memory-map region), moves PC past the call and sends `run`. Costs:

- two messages and a stop / restart per call: a hypercall in a loop runs at message speed, and each
  restart resets the run loop's timing;
- `run_until` has to special-case `hypercall` stops, and `isRunning` flickers for the UI;
- `LOG_REGS` reads the registers from shared memory, which is right only because the CPU is stopped;
  likewise the arguments are read after the fact.

### Design: each hypercall in two parts

The command byte after the BRK is `[S][cmd: 7 bits]`: `cmd = byte & $7F` (127 commands, $01-$04
used today), `S = byte & $80` asks the machine to **stop after the call**. So `BRK $02` logs the
registers and carries on, `BRK $82` logs them and stops: a log and a breakpoint in one, decided by
the program at each call. (On machines with `hypercalls: true`, `BRK $81-$84` become hypercalls
too; they are plain BRKs today and nothing in the repo uses them.)

**Part 1, worker (decode + CPU side).** On `BRK <byte>` where `byte & $7F` is a hypercall command:

1. Decode the call, reading memory now, as it is at the call:

   | cmd | read in the worker | in the call |
   |---|---|---|
   | `$01` LOG_STRING | format string + `%h` argument bytes, formatted | `stringAddr`, `message` |
   | `$02` LOG_REGS | A X Y P SP (from the registers view the CPU passes) | `regs` |
   | `$03` ADD_REGION | start, size, bank, name string | `region: { start, size, bank, name }` |
   | `$04` REMOVE_REGIONS | count + name strings | `names` |

2. Move PC past the call (length from the decode) and charge the cycles (7, like a BRK).
3. Post a fire-and-forget `{ type: "hypercall", call }`, `call` being the decoded call
   (`cmd`, `address`, `length`, `stop` + the fields above).
4. `S` clear: keep running in the same time slice, no stop.
   `S` set: stop, with **PC after the call** (on the next instruction: the call has already run,
   so play just continues, with nothing to skip) and `{ reason: "hypercall", address, cmd }`,
   `address` being the call's. The stop comes after the message, and worker messages arrive in
   order, so the log line is there before the stop. Independent of "break on BRK": it is an
   explicit request.

When stepping, `S` changes nothing: the step runs the whole call, like any instruction.

**Part 2, main thread (apply the effect).** One handler per command; no memory reads, no PC
change, no `play()`: `$01` → `logBus.emit("hyper", message)`, `$02` → the same with the registers
formatted (`A:2a X:00 …`), `$03` → `addRegion`, `$04` → `removeRegions` for each name
(`applyHypercall` in `hypercall.ts`).

**One decoder** for the worker and the disassembler: `decodeHypercall(readByte, address)` in
`src/lib/hypercalls.lib.ts` (it only imports a type and `toHex`, so the worker can use it). The
disassembler builds its line from it and shows `S` as the operand (`!!LOG_REGS STOP`). The two
had drifted: for `%h` the runtime checked `formatCode & $7F`, the disassembler `fmt === $68`, so
with a high-bit Apple II string (`h` = `$E8`) the disassembly showed a different call length from
the one executed.

**Stop reason**: `hypercall` is kept, with a new meaning. It was a transient stop that `run_until`
waited through; now only `S` calls stop, and on purpose, so `run_until` returns
`stopped: "hypercall"` with the command name and the call's address (a test program can end with a
stopping hypercall and `run_until` returns right there).

Gains: no stop / resume for normal calls; no special case in `run_until`; same behaviour running
or stepping; the log shows the state at the call, not a moment later.

Details:

- the worker reads the call with `bus.readDebug` when the bus has one (`bus.read` otherwise):
  `bus.read` on an I/O address would trigger soft switches; a call costs 7 cycles, like a BRK;
- `%`, `h` and the text of LOG_STRING are read with the high bit stripped; `%%` is a `%`, any
  other `%x` is kept as is;
- code: `src/lib/hypercalls.lib.ts` (decoder + disassembly line), the BRK case in `cpu.65c02.ts`,
  `applyHypercall` in `src/virtualmachine/hypercall.ts`; tests in `src/lib/tests/hypercalls.lib.test.ts`
  and `src/virtualmachine/cpu/tests/brk.test.ts`;
- not built: a future command that must answer the 6502 (e.g. a result in A) can't be
  fire-and-forget: it would need the CPU to wait for the main thread. That would be a property of
  the command (unlike `S`, chosen per call); none of the four needs it.

## Pitfalls

- **Async execution**: free-running VM is useless to an agent — every "run" must block until a
  pause condition or timeout, then return state.
- **Output volume**: hexdump / disasm get big — cap and paginate.
- **Determinism**: save states would make experiments repeatable (restore → patch → compare).
- **Overlap with Gemini `explain`**: keep `explain` for quick in-app use; MCP for long investigations.
- **Security**: bind to localhost only; `write_memory` / `exec` = arbitrary control of the session.
