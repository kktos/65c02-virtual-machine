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
7. **At reset the new MMU is the identity**: `$00` on physical bank 0, `$01` on physical bank 1, all pages RWX, in
   every context, and context 0 is in effect. A program that never touches it sees a plain //e.
8. **BANKSEL is a special case of the new MMU**: writing N maps the 256 pages of `$01` of the current context onto
   physical bank N (identity pages, RWX), masked to the banks that exist. It replaces whatever mapping `$01` had.
9. **The video reads the virtual 128K**, through the table of the focused context (see "Focus"). It translates once
   per page, not per byte.
10. **Everything lives in the shared memory**: the RAM pool, the ROMs, the new MMU table and the CPU-side tables.
    The UI thread, the CPU worker and the video read the same mapping, instead of syncing flags and redoing the
    rules.
11. **ROM stays outside the new MMU**: `$D000-$FFFF` ROM, the internal Cx ROM and the slot ROMs are fixed, R+X.
    (To be revisited: see "Open questions".)
12. **`$C000-$CFFF` stays on the slow path**, with today's code: soft switches, `$CFFF`, the `$C3xx` → INTC8ROM
    latch, the active expansion slot, the cards' `readRom` / `readExpansion`.
13. **Save states**: the format's version is bumped, older states are rejected (no converter).
14. **Several maps, picked by an id (contexts).** The new MMU holds 16 tables of 512 entries. Building one is slow
    and done once; switching to it is one write. A process is a context.

## Address spaces and notation

| Space    | What it is                                          | Notation   | Example    |
| -------- | --------------------------------------------------- | ---------- | ---------- |
| CPU      | what the 65C02 reads now, through the soft switches | `$xxxx`    | `$0400`    |
| Virtual  | the //e's 128K: `00` main, `01` aux                 | `$bb:xxxx` | `$01:0400` |
| Physical | the bank pool                                       | `$bb/ppoo` | `$05/0600` |

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

| CPU pages | Main or aux, chosen by                          | Virtual page                 |
| --------- | ----------------------------------------------- | ---------------------------- |
| `$00-$01` | ALTZP                                           | same                         |
| `$02-$BF` | RAMRD (read) / RAMWR (write)                    | same                         |
| `$04-$07` | 80STORE ? PAGE2 : RAMRD / RAMWR                 | same                         |
| `$20-$3F` | 80STORE && HIRES ? PAGE2 : RAMRD / RAMWR        | same                         |
| `$C0-$CF` | (slow path: I/O, Cx ROM)                        | none                         |
| `$D0-$DF` | ALTZP; BANK2; READRAM / WRITERAM, ROM otherwise | bank 2: `$Dx`, bank 1: `$Cx` |
| `$E0-$FF` | ALTZP; READRAM / WRITERAM, ROM otherwise        | same                         |

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

They are rebuilt when a soft switch that changes the mapping is hit, when the current context's table is written,
and on BANKSEL: only the CPU pages of the regions that changed. A context switch rebuilds all 256 entries.

`readDebug`, `readDebugRange`, `getScope` and `getBank` all go through the same translation (the region gives the
scope's name). A debugger view such as "show LC bank 2" composes a table from a modified copy of the switches.

### New MMU table entry

One 32-bit entry per virtual page (proposal):

| Bits  | Field         |
| ----- | ------------- |
| 0-7   | physical page |
| 8-15  | physical bank |
| 16    | R             |
| 17    | W             |
| 18    | X             |
| 19-31 | reserved, 0   |

## Contexts

A single table isn't enough to swap memory: swapping a 16K window rewrites 64 entries, the map is half old and half
new until the last write, and the code doing it may be in the window it swaps. So the new MMU holds **16
contexts**, each a full 512-entry table. Context 0 is the one in effect at reset.

- **Building a context** is done once, through range commands (below).
- **Switching** is one write to `CTX`: the CPU tables are rebuilt from the new context, all at once.
- **The video** reads through the `FOCUS` context, not `CTX`, so a context switch doesn't change what's on screen.
- **BANKSEL** rewrites `$01` in the current context.

### Registers

A device in the //e's I/O space (where: see "Open questions"), 16 registers:

| Offset    | R/W | Name   |                                                                                                                 |
| --------- | --- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `$0`      | RW  | CTX    | the context in effect                                                                                           |
| `$1`      | RW  | EDIT   | the context the next registers edit                                                                             |
| `$2`      | W   | CLONE  | writing n copies context n into EDIT. Reads 0                                                                   |
| `$3`      | RW  | VBANK  | first virtual page: bank (`$00`, `$01`)                                                                         |
| `$4`      | RW  | VPAGE  | first virtual page: page                                                                                        |
| `$5`      | RW  | PBANK  | first physical page: bank, masked to the banks that exist                                                       |
| `$6`      | RW  | PPAGE  | first physical page: page                                                                                       |
| `$7`      | RW  | RIGHTS | bit 0 R, bit 1 W, bit 2 X                                                                                       |
| `$8`      | W   | COUNT  | **writing it maps COUNT pages** (0 means 256) of EDIT, then moves the page registers past the last one. Reads 0 |
| `$9`      | RW  | RETCTX | the context the next RTI of an IMU handler returns to (see "Contexts and interrupts"). `$FF`: none              |
| `$A`-`$F` |     |        | faults (see "Open questions")                                                                                   |

- The page registers carry from page into bank, so ranges can cross `$00:FFxx` → `$01:00xx`. A range stops at
  `$01:FFxx`.
- A COUNT write on the context in effect changes the CPU tables at once (only the CPU pages it maps).
- Reset: CTX = EDIT = 0, RETCTX = `$FF`, every context the identity.

### Example: a window

```
        LDA #1   : STA MMU_EDIT
        LDA #0   : STA MMU_CLONE    ; ctx 1 := ctx 0
        LDA #$00 : STA MMU_VBANK
        LDA #$60 : STA MMU_VPAGE    ; $00:6000
        LDA #$02 : STA MMU_PBANK
        LDA #$00 : STA MMU_PPAGE    ; $02/0000
        LDA #3   : STA MMU_RIGHTS   ; RW
        LDA #$40 : STA MMU_COUNT    ; 64 pages: $00:6000-$9FFF -> $02/0000-$3FFF
        ...
        LDA #1 : STA MMU_CTX        ; window in
        LDA #0 : STA MMU_CTX        ; window out
```

**The `STA MMU_CTX` has to be in a page mapped the same in both contexts**: the next opcode is fetched through the
new map. The LC area, or any page left shared, works.

### Contexts and interrupts

The IMU's HBANK (see IMU.md, `InterruptContext`) is a context id. 0 means "stay in the current context", so context
0 can't be a handler's context: it's the one programs that know nothing of the MMU run in.

- `enter(bank)`: if bank is not 0, switch to that context, after the pushes and before the handler's first fetch.
  Returns the context that was in effect.
- `exit(saved)`: before the RTI's pulls, switch to RETCTX if it's set (then clear it), to `saved` otherwise.

The pushes go to the interrupted context's stack, and the pulls come from the stack of the context `exit` switches
to. That is all a preemptive scheduler needs, on the timer (ID 8) with HBANK = the kernel's context:

```
TIMER   STA SAVE_A : STX SAVE_X : STY SAVE_Y   ; kernel ZP: process table of the current process
        TSX : STX SAVE_SP
        ...                                    ; pick the next process, B
        LDX B_SP : TXS
        LDA #B_CTX : STA MMU_RETCTX
        STA IMU_EOI
        LDA B_A : LDX B_X : LDY B_Y
        RTI                                    ; to B's context: pulls the frame B pushed when it was preempted
```

The handler runs with the interrupted SP, on its own context's stack page. RETCTX is a single latch: a handler
interrupted by a higher priority one between the RETCTX write and its RTI loses it. The scheduler runs at the
lowest priority, with I set.

### Processes

A process is a context: its own virtual 128K, its own ZP and stack, backed by its own physical banks. Three
processes of 128K each need `banks: 6`, plus room for the kernel's context.

- The kernel gives the screen and the keyboard to a process by writing its context to `FOCUS`.
- The //e soft switches (RAMRD, ALTZP, 80STORE, the LC, the video modes) aren't part of a context. The kernel can't
  save them all in software: the LC's write enable and its pre-write state can't be read back. Processes are
  written for the kernel (see "Open questions").
- Running unmodified Apple software side by side is out of scope: the `$C0xx` I/O is shared, the firmware isn't
  reentrant, and preemption breaks timing loops. Three independent machines are an emulator feature, not an MMU
  one.

## Focus

Like the focused window of a modern OS, one context is the user's: it has the screen and the keyboard. `FOCUS` is
a context id held by the VM, not the MMU. Reset: 0.

- **The video** reads through the `FOCUS` context's table.
- **The keyboard**: `$C000` / `$C010` give the key only to code running in the focused context (`CTX == FOCUS`).
  Another context reads no key, and its `$C010` doesn't clear the strobe.
- **Who sets it**: the guest, through an I/O register of the VM (the kernel's task switcher), and the user, from the
  emulator's UI or MCP.
- **The register**: one byte, RW. Written, it gives the focus to a context; read, it tells the kernel which context
  has it, also after the user changed it from the UI.

## Shared memory layout

```
[ system ROM $D000-$FFFF 12K | internal Cx ROM 4K | slot ROMs 4K | sink page ]     static
[ bank 0 ][ bank 1 ][ bank 2 ] … [ bank N-1 ]                                        64K each
[ contexts: 16 × 512 × 32 bits ][ CPU tables: read, write, exec, 256 × 32 bits each ]
[ MMU registers: CTX, EDIT, RETCTX, the page registers ][ FOCUS ]
```

The Cx ROMs keep 4K each (`$C000-$CFFF`) so their pages stay aligned; `$C0xx` is unused.

## Changes

- `shared-memory.consts.ts`: the new layout, in place of `LC_*_OFFSET` / `RAM_OFFSET`.
- `apple.bus.ts`: the tables, `remap`, the fast path; `bank2` / `auxbank2` gone; `romC` / `slotRoms` in the ROM area.
  `readDebug*`, `getScope`, `getBank` through the translation.
- `apple.switches.ts`: the switches that change the mapping call `remap` for their regions; BANKSEL rewrites `$01`.
- `bus/apple.loader.ts`: `bank` is a virtual bank; `lgcard.bank2` loads at `$bb:D000`, `lgcard.rom` / `int.rom.cx` /
  `slot(s).rom` into the ROM area.
- The MMU registers: a device (see DEVICES.md), and the `InterruptContext` given to the IMU.
- Video (`apple.video.ts`, `text.ts`, `gr.ts`, `hgr.ts`): read the virtual 128K through the focused context.
- Keyboard: `$C000` / `$C010` check `CTX == FOCUS`.
- `FOCUS`: its I/O register, and a setter in the UI and MCP.
- MCP (`lib/mcp/tools.ts`): `toAddress` / `hexAddr` for the three notations.
- Debugger UI: the notations and their colors; the overrides replaced by addresses where they name a location.
- Save states: version bump.

## Open questions

- **Where the registers go.** Slot 3's I/O (`$C0B0-$C0BF`) is the IMU's and the timer's. Another slot's 16 bytes
  in `$C090-$C0FF`? And `FOCUS`'s.
- **A focus change event**: an IMU interrupt when the UI changes `FOCUS`, so the kernel can follow it.
- **How many contexts**: 8 or 16. 16 tables are 32K of shared memory.
- **The soft switches in a context**: a flag per context so it also holds the //e switches, saved and restored by
  a switch. Needed to isolate processes that set them.
- **A supervisor bit**: only a context with it may write the MMU registers, the others fault. Without it, any
  process can remap anything.
- **ROM in the new MMU**: mappable, so RAM can be put under the system ROM?
- **Faults**: per page or global mode? Which IMU ID? What a faulting read returns, and what the CPU executes on an
  exec fault (a BRK in place of the opcode?). Registers `$A`-`$F`: faulting CPU address, access kind, context.
