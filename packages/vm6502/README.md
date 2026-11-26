# vm6502

A 6502 / 65C02 emulator and debugger that runs in the browser (Vue 3, TypeScript, Vite). The CPU runs in a web worker;
registers, memory and video are shared with the UI through `SharedArrayBuffer`s.

## Machines

- **Apple //e**: 128K, 40/80 columns, LoRes / HiRes / double HiRes, speaker, keyboard and joystick. Slot cards set by
  the user: SmartPort hard disk, AppleMouse, ThunderClock, Mockingboard. Vectored interrupts through the IMU.
- **Commodore PET 3032** (BASIC 2), with a 4040 drive. Its ROMs aren't committed: `pnpm roms:pet` fetches them.
- **KlausTest**: Klaus Dormann's 65C02 extended opcodes test.

## Debugger

- Disassembly with labels, comments and data formats; memory viewer; stack view; instruction trace
- Breakpoints (PC, read, write, access) with hooks; run until, step over / out
- A console with its own command language: expressions, routines, logs, a mini monitor and assembler
- Disk library kept in the browser, and a disk editor (DOS 3.3, ProDOS, D64) with hex, HGR and disassembly viewers
- Save states
- An MCP server, so an agent can drive the emulator: see [`../vm6502-mcp`](../vm6502-mcp/README.md)

## Running

```sh
pnpm install
pnpm dev          # http://localhost:5173 (add ?mcp for the MCP bridge)
pnpm test
pnpm build
pnpm bench:cpu    # headless CPU benchmark
```

Before a commit: `pnpm oxfmt` and `pnpm oxlint`.

## Docs

| File                                   | What it covers                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| [CHANGELOG](docs/CHANGELOG.md)         | What's been done, by date, including the `VirtualMachine` code review                |
| [TODO](docs/TODO.md)                   | Open items and ideas, by date                                                        |
| [DEVICES](docs/DEVICES.md)             | Machine devices: how they're loaded, and the //e's register window (proposed)        |
| [IMU](docs/IMU.md)                     | Interrupt Management Unit: vectored interrupts for the 6502 (implemented on the //e) |
| [MMU](docs/MMU.md)                     | Memory Management Unit: page tables to replace the //e's banking (design)            |
| [PERF](docs/PERF.md)                   | How the emulator was made faster, how to measure it, the rules to keep, what's next  |
| [MCP_CHANGELOG](docs/MCP_CHANGELOG.md) | The MCP server and its tools: what's been built                                      |
| [MCP_TODO](docs/MCP_TODO.md)           | The MCP server: what's next                                                          |
