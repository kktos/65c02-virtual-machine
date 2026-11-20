# MCP server for the emulator — TODO

Goal: let an agent (Claude Code, etc.) drive the emulator — debugger, metadata, I/O —
instead of the app pushing a snapshot to an LLM (the former `explain` / Gemini, now removed).

What's already built: `MCP_CHANGELOG.md`.

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

- [ ] **Headless later** (optional): run CPU + bus in Node for CI / batch. Requires decoupling
      commands from Vue composables (`useMachine`, …).

## Tools

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
- [ ] `run_until` `cycles` limit (needs worker support)
- [ ] save states: keep them across reloads (IndexedDB) / export them; a disk that can be written would need
      copy-on-write in the card

Lower: exec_command already reaches them, or they are comfort.

- [ ] labels / comments / data-format CRUD as structured tools (`defLabel`, `comment`, `defData`, `labels`,
      `findLabel`, `xref` work through exec_command)
- [ ] MCP resources: memory map, current disk symbols
- [ ] end-to-end pass over the bridge for `write_memory`, `disassemble` and the disassembler's `peek`
      (unit-tested only)

## WebMCP

- [ ] try it for real (enable the flag), check how long-running `run_until` behaves
- [ ] mark tools that change state (`write_memory`, …) with `consequentialHint`

## Pitfalls

- **Async execution**: free-running VM is useless to an agent — every "run" must block until a
  pause condition or timeout, then return state.
- **Output volume**: hexdump / disasm get big — cap and paginate.
- **Determinism**: save states make experiments repeatable (restore → patch → compare).
- **Security**: bind to localhost only; `write_memory` / `exec` = arbitrary control of the session.
