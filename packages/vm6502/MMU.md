# MMU: Memory Management Unit (design)

Status: design, not implemented. The //e only for now (not the PET, not a generic chip).

The MMU replaces the //e bus's memory banking, which is today a set of special cases, with page tables in the
shared memory. It keeps the //e's own banking (the soft switches) exactly as software expects it, and adds a second,
programmable layer under it: the //e's 128K can be mapped, page by page, anywhere in a pool of 64K banks, with
read / write / execute rights on each page.

## Background: what the bus does today

- **The mapping is worked out on every access.** `read`, `write`, `readDebug`, `readDebugRange`, `getScope` and
  `getBank` in `apple.bus.ts` each have their own `if` chains for the //e banking rules, and they have drifted apart
  (`readDebug` tests INTC8ROM from `$C7FF`, `read` from `$C800`).
- **The layout of the shared memory is ad hoc**: `[LC bank 2 main 4K][LC bank 2 aux 4K][ROM 12K][main 64K][aux
  64K]`, the internal Cx ROM stored in main's `$C100-$CFFF` hole and the slot ROMs in aux's.
- **BANKSEL (`$C073`, RamWorks) does nothing**: `auxMemBank` is stored, synced and saved, but `read` / `write`
  always add `$10000`.
- **The video knows the layout**: `RAM_OFFSET` in `apple.video.ts`, `AUX_BANK_OFFSET = 0x10000` in `hgr.ts`, and
  `gr.ts` / `text.ts`.
- **The debugger can't name every location**: LC bank 2 or the slot ROMs are reached through override strings
  (`lcView`, `lcAux`, `cxView`), not addresses.

## Decisions

1. **Two layers.** The legacy //e MMU (the soft switches) stays, unchanged for software, and maps the CPU's 64K onto
   a virtual 128K. The new MMU maps that 128K onto physical memory.
2. **The virtual 128K is the //e's RAM, with no hole.** Bank `$00` is main, `$01` aux. As on the real //e (and in
   AppleWin), **LC `$D000` bank 1 lives at `$C000-$CFFF`** of its bank, the 4K the CPU can't reach directly, and
   bank 2 at `$D000-$DFFF`. Each 64K bank is self-contained: 48K, ZP and stack, both LC banks, LC high RAM.
3. **Page size: 256 bytes.** The 6502's page, and the granularity the legacy layer needs anyway (`$C3xx`, `$C800`).
   The new MMU table has 512 entries (`$00:00xx` to `$01:FFxx`).
4. **Rights per page: R, W, X.** A missing right is a fault.
5. **On a fault: ignore it or raise an interrupt on the IMU**, the faulting address and access kind latched in a
   register. Ignored, a write is dropped (as a write to ROM).
6. **The physical memory is a pool of 64K banks**, as many as `memory.conf.ts`'s `banks` (2 at least). Any virtual
   page can be mapped to any physical page: the main and aux banks are not tied to each other.
7. **At reset the new MMU is the identity**: `$00` on physical bank 0, `$01` on physical bank 1, all pages RWX. A
   program that never touches it sees a plain //e.
8. **BANKSEL is a special case of the new MMU**: writing N maps the 256 pages of `$01` onto physical bank N
   (identity pages, RWX), masked to the banks that exist. It replaces whatever mapping `$01` had.
9. **The video reads the virtual 128K**, through the new MMU table: 40-column text is `$00:0400`, wherever it's
   mapped. It translates once per page, not per byte.
10. **Everything lives in the shared memory**: the RAM pool, the ROMs, the new MMU table and the CPU-side tables.
    The UI thread, the CPU worker and the video read the same mapping, instead of syncing flags and redoing the
    rules.
11. **ROM stays outside the new MMU**: `$D000-$FFFF` ROM, the internal Cx ROM and the slot ROMs are fixed, R+X.
    (To be revisited: see "Open questions".)
12. **`$C000-$CFFF` stays on the slow path**, with today's code: soft switches, `$CFFF`, the `$C3xx` → INTC8ROM
    latch, the active expansion slot, the cards' `readRom` / `readExpansion`.
13. **Save states**: the format's version is bumped, older states are rejected (no converter).

## Address spaces and notation

| Space | What it is | Notation | Example |
|---|---|---|---|
| CPU | what the 65C02 reads now, through the soft switches | `$xxxx` | `$0400` |
| Virtual | the //e's 128K: `00` main, `01` aux | `$bb:xxxx` | `$01:0400` |
| Physical | the bank pool | `$bb/ppoo` | `$05/0600` |

- The virtual and physical forms have the same length (8 characters), and the leading `$` keeps them apart from
  labels (`ns::label`).
- `$0400` always means "what the CPU would read now"; `$00:0400` always means main, whatever the switches say.
  (Today `readDebug` reads `$0400` as main whatever RAMRD says, but `$D000` through the live LC state.)
- Output (MCP tools, trace, logs) always prints the bank with two digits. Input accepts one or two.
- A JSON number is a 24-bit virtual address: `0x10400` is `$01:0400`.
- The old form `$1C000` is still accepted as virtual, but not printed any more.
- Decimal address strings (`"0400"` meaning 400) are no longer accepted. Numbers stay.
- In the UI, the same text, with a color per space.

Virtual addresses in the LC area: `$01:C400` is aux LC bank 1 `$D400`, `$01:D400` aux LC bank 2 `$D400`.

## Translation

```
CPU $0000-$FFFF ──[legacy //e MMU: soft switches]──► virtual $bb:xxxx   (bb = 00 main, 01 aux)
                                                       │
                                        [new MMU: 512 entries, rights R/W/X]
                                                       ▼
                                                physical $bb/ppoo  ──► offset in the SharedArrayBuffer
```

### Legacy layer: the //e regions

| CPU pages | Main or aux, chosen by | Virtual page |
|---|---|---|
| `$00-$01` | ALTZP | same |
| `$02-$BF` | RAMRD (read) / RAMWR (write) | same |
| `$04-$07` | 80STORE ? PAGE2 : RAMRD / RAMWR | same |
| `$20-$3F` | 80STORE && HIRES ? PAGE2 : RAMRD / RAMWR | same |
| `$C0-$CF` | (slow path: I/O, Cx ROM) | none |
| `$D0-$DF` | ALTZP; BANK2; READRAM / WRITERAM, ROM otherwise | bank 2: `$Dx`, bank 1: `$Cx` |
| `$E0-$FF` | ALTZP; READRAM / WRITERAM, ROM otherwise | same |

The table is declarative: pages, the selector, the virtual page. The LC's double-read write enable stays in the
soft switches.

### The CPU-side tables

The two layers are composed ahead of time into three tables, one entry per CPU page:

- `read`, `write`, `exec`: `Int32Array(256)`, each entry the buffer offset of the page, or `-1` for the slow path.
- A ROM page's `write` entry points to a sink page: the write is lost, without a branch.
- A page without the right gets `-1`: the slow path raises the fault. Rights cost nothing on the fast path.
- `exec` is used on opcode fetches (`bus.read(pc, true)`).

```ts
read(a)     { const p = this.rd[a >> 8]; return p >= 0 ? mem[p | (a & 0xff)] : this.slowRead(a); }
write(a, v) { const p = this.wr[a >> 8]; if (p >= 0) mem[p | (a & 0xff)] = v; else this.slowWrite(a, v); }
```

They are rebuilt when a soft switch that changes the mapping is hit, when the new MMU table is written, and on
BANKSEL; only the CPU pages of the regions that changed.

`readDebug`, `readDebugRange`, `getScope` and `getBank` all go through the same translation (the region gives the
scope's name). A debugger view such as "show LC bank 2" composes a table from a modified copy of the switches.

### New MMU table entry

One 32-bit entry per virtual page (proposal):

| Bits | Field |
|---|---|
| 0-7 | physical page |
| 8-15 | physical bank |
| 16 | R |
| 17 | W |
| 18 | X |
| 19-31 | reserved, 0 |

## Shared memory layout

```
[ system ROM $D000-$FFFF 12K | internal Cx ROM 4K | slot ROMs 4K | sink page ]     static
[ bank 0 ][ bank 1 ][ bank 2 ] … [ bank N-1 ]                                        64K each
[ new MMU table: 512 × 32 bits ][ CPU tables: read, write, exec, 256 × 32 bits each ]
```

The Cx ROMs keep 4K each (`$C000-$CFFF`) so their pages stay aligned; `$C0xx` is unused.

## Changes

- `shared-memory.consts.ts`: the new layout, in place of `LC_*_OFFSET` / `RAM_OFFSET`.
- `apple.bus.ts`: the tables, `remap`, the fast path; `bank2` / `auxbank2` gone; `romC` / `slotRoms` in the ROM area.
  `readDebug*`, `getScope`, `getBank` through the translation.
- `apple.switches.ts`: the switches that change the mapping call `remap` for their regions; BANKSEL rewrites `$01`.
- `bus/apple.loader.ts`: `bank` is a virtual bank; `lgcard.bank2` loads at `$bb:D000`, `lgcard.rom` / `int.rom.cx` /
  `slot(s).rom` into the ROM area.
- Video (`apple.video.ts`, `text.ts`, `gr.ts`, `hgr.ts`): read the virtual 128K through the new MMU table.
- MCP (`lib/mcp/tools.ts`): `toAddress` / `hexAddr` for the three notations.
- Debugger UI: the notations and their colors; the overrides replaced by addresses where they name a location.
- Save states: version bump.

## Open questions

- **How 6502 code programs the new MMU.** Slot 3's I/O (`$C0B0-$C0BF`) is the IMU's and the timer's. A register
  window as a device in `$C090-$C0FF` (virtual page index, physical page and bank, rights, auto-increment)?
- **ROM in the new MMU**: mappable, so RAM can be put under the system ROM?
- **Faults**: per page or global mode? Which IMU ID? What a faulting read returns, and what the CPU executes on an
  exec fault (a BRK in place of the opcode?).
- **The IMU's HBANK** (see IMU.md, `InterruptContext`): what a handler's bank byte means for the MMU, and how
  `enter` / `exit` switch maps.
