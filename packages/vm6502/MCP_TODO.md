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
- [x] `step(n)`, `reset` — both wait for the worker: `VirtualMachine.step(count)` / `reset()` return promises
      (a worker command sent with an `id` gets a `reply` message). `step` runs up to n instructions in the worker
      (`stepInstructions`), each like Step Into, stopping early on a PC breakpoint, a stopping hypercall or an
      error; a step now sets `lastStop` (`step`, or why it stopped early)
- [x] `write_memory(address, bytes)` — debug write (`bytes`: array or hex string, max 4096), where read_memory
      reads ($1xxxx = aux, $D000+ = the current LC read view, so ROM patches work); reads back and reports
      `not_written` ranges (I/O, slot ROM space) and returns `previous` for undo. read_memory / write_memory
      now sync the bus's soft switches first (they could be stale when the screen isn't rendering)
- [x] `disassemble({ address, count?, end_address? })` — JSON, one compact line per instruction (`address`, `bytes`,
      `instruction`, `label`, `target` when the operand is a label, `comment` / `block_comment`); at most `count`
      lines (default 32, max 256), up to `end_address` (default: end of the 64K bank); `next_address` to page on.
      Uses the app's disassembler, with debug reads only
- [x] `set_breakpoint` / `remove_breakpoint` / `list_breakpoints` — JSON results; `set` is idempotent
      (re-enables a disabled one, updates its `command`), `remove` answers `not_found` rather than failing,
      `all: true` clears everything

Still open, by priority (reviewed 2026-11-08: what blocks the use cases above):

1. [x] **Loading software**. Done: `list_disks` (library + what's in the drive), `load_disk({ disk, boot? })` (by key
       or name; `boot` cold-boots: PWREDUP invalidated + reset, like Ctrl-OpenApple-Reset), `eject_disk`, all through
       `useDiskDrive`, shared with the toolbar. `load_disk({ path })` (done): an image on the agent's machine. The tab's
       schema marks `path` with `"x-vm6502-host-file": true`; the Node relay reads the file (`hostFiles.ts`: absolute,
       `~`, or relative to its cwd; max 64 MB) and sends `{ name, path, size, data: base64 }` in its place; the tab
       checks the extension (`DISK_EXTENSIONS`, shared with the toolbar) and `insertFile` adds it to the library
       under its file name (`replaced: true` when one was there). Over WebMCP a plain path string is refused.
       `load_binary({ path, address?, set_pc? })` (done): same mechanism, any file; its bytes are written like
       write_memory (`writeAndVerify`, shared: `not_written` ranges) and must fit in the address's 64K bank.
       Without `address`, a CiderPress name gives it (`PROG#060800`: type $06 BIN, aux type = load address).
       `set_pc: true` sets PC to it, paused machine only (the running worker keeps its own registers).
       Raw bytes only: no DOS 3.3 header (address + length) or AppleSingle is decoded.
2. [x] **Execution trace**: `get_trace({ enable?, size?, count? })`. The existing trace (`vm.getTrace`, `TraceView`)
       only logs JSR / JMP, so this is a new one: a ring buffer in the worker (`cpu/instructionTrace.ts`, 2 words per
       entry, default 4096, max 65536) of every executed instruction with A X Y P SP *before* it, recorded in
       `executeInstruction` after the breakpoint check (an instruction stopped on isn't recorded). Off by default:
       one flag check per instruction. Read with a worker request; the tool disassembles the entries (memory as it is
       now) with labels. Recording is lost when the VM is rebuilt (reload, `reboot`).
3. [x] **Memory snapshot + diff** (cheat-finder): `memory_snapshot({ address?, end_address? | ranges? })` records
       the ranges (default $0000-$BFFF, max 256 KB, banks allowed: $10000-$1BFFF = aux) and makes every byte a
       candidate; `memory_diff({ filter?, value?, by?, count? })` keeps those matching `changed` / `unchanged` /
       `increased` / `decreased` (`by`: exact, modulo 256) / `equals` / `not_equals` against their reference,
       whose value then becomes the reference (Cheat Engine's "next scan"). No `filter`: lists without narrowing.
       Lists the first `count` (default 50) with `label`, `previous`, `value`. The search lives in the tab
       (`MemorySearch`, `src/lib/memorySearch.lib.ts`: one `readDebugRange` per range per round, candidates as
       offsets). Tried on the running Conan intro: a byte planted with write_memory found in 3 rounds (49152 → 1).
       Byte-wise only: 16-bit / BCD values aren't matched as such.
4. [x] **`screenshot`**: the screen as an MCP image (PNG), any mode, border included, at the video buffer's
       resolution (//e: 640x480). Built from the shared video buffer (palette indices) + the palette and view rect
       the machine's video sends (`vm.screenshot()`), not from the WebGL canvas: exact pixels, whatever the
       canvas size or scaling. Paused, the frame is redrawn first (`refreshVideo` now answers the worker request).
       The toolbar's Video Settings > Save Screenshot uses the same `vm.screenshot()` (it saved the first `<canvas>`
       of the page as drawn: scaled, with the integer-scaling bands).
       Encoded as an 8-bit indexed PNG by `src/lib/png.lib.ts` (no dependency, `CompressionStream`). Tools can now
       answer MCP content blocks (`{ content: [...] }`) besides text; the WS bridge and the Node relay pass them on.
5. [x] **Full save states**: `save_state({ name? })` / `restore_state({ name? })` / `list_states` / `delete_state`
       (default name `default`). A state (`src/virtualmachine/cpu/saveStates.ts`, kept in the worker, at most 32,
       ~150 KB each on the //e) is the CPU registers, the debugger's stack metadata, the whole memory section of the
       shared buffer (main / aux RAM, LC banks, ROMs) and `IBus.snapshot()`: on the //e the soft switches, LC
       pre-write count, Video-7 registers, keyboard latch, colors, `totalCycles`, active expansion slot, paddle
       timers, and each card's `snapshot()` (mouse position / clamps / mode; SmartPort's disk image, shared, not
       copied: the card never writes it). Not the live inputs (joystick, paddle positions), the speaker, breakpoints,
       the trace or the metadata. Saved / restored between two run-loop time slices (consistent while running);
       restoring stops the machine (`prepareForRestore`: as a pause, forgets the BRK / step-out it was on), redraws
       the frame, and the bus rewrites the shared soft switch bytes (`syncState`, which toggles `fakingVBL`: put
       back). The tab passes the drive's disk as metadata: `restore_state` says (`disk_note`) when the toolbar shows
       another one. Lost when the VM is rebuilt (reload, `reboot`).
       Checked: `machines/apple2/tests/saveState.test.ts` on the real //e (state back exactly; 50k instructions
       replayed from a restored state end identical); live on Conan: restore → `memory_diff changed` = 0 of 98304,
       and 20000 steps twice from the state give the same registers and memory.
       Possible next: keep states across reloads (IndexedDB) / export them; a disk that can be written would need
       copy-on-write in the card.

Lower: exec_command already reaches them, or they are comfort.
- [ ] labels / comments / data-format CRUD as structured tools (`defLabel`, `comment`, `defData`, `labels`,
      `findLabel`, `xref` work through exec_command)
- [ ] MCP resources: memory map, current disk symbols
- [ ] end-to-end pass over the bridge for `write_memory`, `disassemble` and the disassembler's `peek`
      (unit-tested only)

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
      Seen again (Karateka, 2026-11-08): hook `log loads … ;run` on `$0309`, `run_until $3F2E` returned
      `stopped: breakpoint $0309` while the machine went on running (the harness's results at `$3F57` were
      written after). The machine isn't stopped when the result says so: keep waiting when the hook resumes, or
      say the hook resumed it
- [x] hook commands never ran on range or `access` breakpoints: on a hit, `useMachine` looked the breakpoint up
      by exact `{ type, address }`, but the worker reports `read` / `write` and the physical byte accessed.
      `findHitBreakpoints(type, address)` (`useBreakpoints`) now returns the enabled ones covering it (`access`
      answers both), most specific first (same type before `access`, then narrowest range): that one's command
      runs, and every temporary one among them is removed.
- [ ] `run_until` `cycles` limit (needs worker support)
- [x] eject put labels / formats / notes on disk key `""`, not the system set (`*`) a fresh start uses: entries added
      after an eject went to a bucket no startup loads. `setDiskKey("*")` also kept the ejected disk's entries on
      screen (only `init*` cleared them); it now clears them
- [x] once a disk had been inserted, the machine could never start without one: the last disk is remembered
      (localStorage) and put back at startup, and nothing ejected it. The drive logic moved from
      `DiskDriveControl.vue` to `useDiskDrive` (shared with the MCP tools to come); `eject` empties the drive
      (`vm.ejectDisk` → `ejectMedia` → SmartPort card: calls answer $2F, the boot resumes the slot scan), forgets
      the disk and puts the metadata back on "no disk"; the library popover shows what's in the drive + Eject.
      Also: a URL disk's `.sym` symbols were added to the *previous* disk (before the metadata switched), and a
      renamed `.2mg` lost its header handling (the card got the display name, not the file name)
- [x] the disassembler reads operand values (`info`, e.g. `LDA $C030,X`) with `readByte(addr, false)`, which
      the `d` / `L` / `explain` commands and the disassembly view sent to `vm.read`: on $C000-$CFFF that runs soft
      switch / card handlers and flips `$CFFF` / slot ROM selection on the main-thread bus. They now use
      `vm.peek` (`IBus.peek`, AppleBus): the CPU's view (ALTZP, RAMRD, LC banking) without side effects, after a
      `syncBusState()` so the banking is current. `vm.read` itself is unchanged (read-mode virtual registers use it)
- [x] text screen decoder lived in the bridge; it's now the machine's: `IBus.getTextScreen({ page, cols })`,
      implemented by `AppleBus` (`src/machines/apple2/video/text.screen.ts`). `screen_text` asks the bus
      (no more machine-name check) and the //e boot test uses it too.
- [x] `screen_text` read page 1 / 40 columns unless told otherwise: in 80 columns the agent got only
      the odd columns (main memory). It now defaults to the displayed screen (`IBus.getTextMode()`:
      PAGE2 unless 80STORE, 80COL, TEXT / MIXED) and its first line says what was read and whether
      it is on screen, e.g. `[page 1, 80 cols — mixed mode: only the last 4 rows are on screen]`.
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
- [ ] `run_until` silently resumes from a stop it never reported. `load_disk({ boot: true })` returns the machine
      running; when a breakpoint hits during the boot, the next `run_until` resumes from it and runs past, and
      the agent never learns it stopped there (Karateka: 3-4 reboots lost, a breakpoint in LC RAM thought broken).
      Ideas: `run_until` returns `resumed_from` (the `last_stop` it resumed from, when the caller hadn't seen it);
      and/or `load_disk` takes `run_until` options (address / timeout) and waits like `run_until`
- [ ] `get_trace` only gives the last `count` (max 1000) entries: on Karateka the 65K-entry ring held the whole
      boot, but its end was the hang loop (`BRA *`) repeated, and what led there was out of reach. Ideas, by use:
      `before` / `offset` to page back; a filter (PC range, or excluding one: the ROM's WAIT); collapsing
      identical consecutive entries (`BRA *` × 60000 → one entry with a repeat count)
- [ ] no way to get memory out to the agent's machine. Checking that a loader put the right bytes in memory
      (Karateka: 6 loads × 12K against the extracted files) meant writing a 6502 checksum routine. Ideas:
      `save_binary({ path, address, length })`, the mirror of `load_binary` (the relay writes the file);
      and/or `compare_memory({ path, address })` returning the ranges that differ. The `WRITE` command saves
      in the browser, not on the agent's side
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
