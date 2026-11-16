# IMU: Interrupt Management Unit (design)

Status: design, not implemented.

The IMU is vectored interrupts for the 6502: up to 8 interrupt sources (IDs), each with its own handler and
priority. When an ID wins, the CPU jumps straight to its handler instead of going through `$FFFE/F`. An ID with no
handler goes through `$FFFE/F` as today. It's per machine: a machine that doesn't wire an IMU is unchanged.

## Background

- **PC (Intel 8259A PIC):** 8 lines, with IRR (requests), IMR (mask) and ISR (in service). The PIC picks the
  highest-priority line and raises INTR. The x86 answers with an INTA cycle, the PIC puts an 8-bit vector number on
  the bus, and the CPU jumps through the IVT at `0000:0000` (256 × segment:offset). The handler sends an EOI.
  Nesting: entering a handler clears IF; in "fully nested" mode only a higher priority can interrupt a handler, and
  only once that handler does `STI`.
- **6502:** no INTA cycle. An IRQ always fetches `$FFFE/F`. Real 6502 systems vectored by substituting that fetch
  (the W65C02S's VPB pin, WDC's 65C134 / 65C265 with one vector per peripheral). The IMU does the same in the
  emulator: the CPU asks the IMU before it reads `$FFFE`.

## Decisions

1. **Per machine.** The IMU is generic and knows nothing about any machine. A machine wires its interrupt sources
   to IMU lines, maps the IMU's registers into its address space, and implements the CPU hooks by delegating to
   the IMU. Machines that don't are unchanged.
2. **Direct vectoring.** The hardware sets PC = handler(id). There is no software dispatcher. Several IDs can share
   one handler, which reads `CURRENT`.
3. **Fallback.** IMU disabled, or the winning ID has no handler (`$0000`): the normal `$FFFE/F` path, so ROM
   `$C3FA` → `$3FE` or ProDOS's handler on the //e. Existing software sees no difference.
4. **BRK and NMI are never redirected.** BRK (hypercalls included) keeps `$FFFE/F`, NMI keeps `$FFFA/B`.
5. **Nesting works as on the PC.** The CPU sets I on entry, so by default nothing interrupts a handler. A handler
   that does `CLI` can be interrupted, but only by a higher priority. EOI is explicit, unless the auto-EOI mode
   is on.
6. **Priority is programmable per ID**, not tied to the ID number (see "Choosing priorities").
7. **Memory is the machine's business.** The handler address is a 16-bit address in the memory map in effect when
   the interrupt is taken. Each handler entry also has a bank byte that the IMU doesn't interpret. A machine MMU
   can give it a meaning through the `InterruptContext` hook. Until the MMU exists, write 0.

## The interrupt sequence

Same as an IRQ, except for where the vector comes from:

```
IRQ line asserted, I clear, end of instruction
  push PC hi, PC lo, P (B clear)         ← interrupted map's stack
  set I, clear D
  bus.irqVector(sp)
     IMU off, or no eligible ID          → undefined
     winner without handler              → undefined                (no ISR bit, no frame recorded)
     winner with handler                 → ISR |= id (unless auto-EOI), CURRENT = id,
                                           saved = context?.enter(bank) ?? 0, frames.push({ sp, saved }),
                                           return handler
  PC = handler ?? read($FFFE/F)
  7 cycles
```

```
RTI
  opcode fetched                         ← handler's map
  bus.onRti(sp)                          → if it's the frame of a vectored IRQ: context?.exit(saved)
  pull P, PC lo, PC hi                   ← interrupted map's stack again
```

`enter` runs after the pushes, and `exit` before the pulls. So the frame is always read back from the stack it was
written to, even when the MMU switches the stack page (ALTZP on the //e).

### Matching the RTI

The 6502 also uses `RTI` for things that aren't returns from a vectored IRQ: the "push address, push P, RTI" jump
trick, returning from a BRK, returning from an IRQ that took the fallback path. So the IMU keeps a stack of frames
`{ sp, saved }`, one per vectored dispatch, where `sp` is the SP after the 3 pushes.

On `onRti(sp)`:

- Drop the frames whose `sp` is below the current SP: their handler abandoned its frame, and the stack has since
  risen above it.
- If the top frame's `sp` equals SP, it's the matching RTI: pop it and call `context?.exit(saved)`.
- Any other RTI passes through untouched.

The frames are cleared on reset. Known limitation: a handler that leaves its stack unbalanced and then runs a
foreign RTI at exactly the recorded SP would be taken for the matching one.

`RTI` doesn't clear ISR bits. EOI does that (see below).

## Arbitration

- `asserted`: the raw lines, as the devices hold them. Level-triggered, like the current IRQ line.
- `eligible = asserted & ~MASK`, minus the IDs blocked by an in-service ID of equal or higher priority (fully
  nested mode). With auto-EOI, nothing is in service, so nothing is blocked.
- The winner is the eligible ID with the lowest PRIO value. Ties go to the lowest ID.
- The CPU's IRQ line:
  - IMU disabled: the OR of `asserted`. That's today's behaviour, so the IMU is transparent.
  - IMU enabled: `eligible ≠ 0`.
- The winner is picked when the vector is requested (that plays the role of INTA), not when a line rises. The lines
  are updated synchronously, so there are no spurious interrupts. If `eligible` is empty at that point anyway,
  `irqVector` returns `undefined`.
- An ID without a handler takes the fallback path, and the fallback handler is not IMU-aware. So no ISR bit is set
  for it: an ISR bit nobody EOIs would block lower priorities forever. The ID is still subject to MASK and to the
  blocking by in-service IDs.

## Registers

The IMU exposes `read(offset)` / `write(offset, value)` over 16 bytes. The machine's bus decodes the address and
forwards, the same way the PET bus forwards to `VIA6522`. Only 4 offsets are used: an index register, a 16-bit
data port, and a direct port for the handler's hot path. The registers themselves are reached through the index,
like the AY of the Mockingboard or the 6845 of a Videx.

### Ports

| Off | R/W | Name | Role |
|---|---|---|---|
| 0 | RW | INDEX | the register (`$00`–`$FF`) that DATA LO / DATA HI refer to. Readable, for save / restore |
| 1 | RW | DATA LO | the selected register, low byte |
| 2 | RW | DATA HI | the selected register, high byte |
| 3 | R | CURRENT | the in-service ID with the highest priority (the handler running), `$FF` if none |
| 3 | W | EOI | any value: clears the ISR bit of `CURRENT` (non-specific EOI) |
| 4–15 | | | reserved: read 0, writes ignored |

CURRENT and EOI have their own port so a handler never touches INDEX: an EOI is a single `STA`.

### Registers

| Reg | Width | R/W | Name | Role |
|---|---|---|---|---|
| `$00` | 8 | RW | CTRL | bit 7: vectoring enabled. bit 6: auto-EOI. Others reserved, 0 |
| `$01` | 8 | RW | MASK | bit n = 1: ID n can't interrupt (vectoring enabled only) |
| `$02` | 8 | R | PENDING | `asserted`: the lines requesting, mask ignored |
| `$03` | 8 | R | INSERVICE | ISR: one bit per ID in service |
| `$08`–`$0F` | 8 | RW | PRIO n | priority of ID n, 0 (highest) to 7 |
| `$10`–`$17` | 16 | RW | HANDLER n | handler of ID n. **Writing DATA HI commits** it, with HBANK n |
| `$18`–`$1F` | 8 | RW | HBANK n | bank byte of ID n (staged), for the machine's `InterruptContext`. 0: current map |
| others | | | | reserved: read 0, writes ignored |

The gaps (`$04`–`$07`, `$20` and up) leave room for more control registers or for 16 IDs.

- 8-bit registers: a DATA LO write takes effect at once. DATA HI reads 0 and ignores writes.
- 16-bit registers: a DATA LO write is staged, the DATA HI write commits both bytes. An IRQ taken between the two
  writes never sees half an address.
- HBANK n is staged too, and committed by the DATA HI write of HANDLER n: the handler and its bank change together.
- Reads return the committed values (handler, bank), so software and the debugger can see the table.
- A handler of `$0000` means no handler, so that ID takes the fallback path.
- Reset: CTRL = 0 (disabled), MASK = 0, all handlers `$0000`, all banks 0, PRIO n = n (so the lower ID wins by
  default), INDEX = 0, ISR = 0, no frames.

### INDEX and interrupts

INDEX is shared. If code writes INDEX, an IRQ comes in, and the handler writes INDEX too, the code then writes
DATA to the wrong register. So **INDEX / DATA sequences run with interrupts disabled**:

- Code that can be interrupted wraps them in `PHP` / `SEI` ... `PLP`. Not `SEI` ... `CLI`: called with I already
  set (from a handler), a `CLI` would let interrupts in too early.
- Handlers start with I set, so they're covered. A handler that does `CLI` to let higher priorities in must
  disable them again around its INDEX / DATA accesses.
- A handler that only EOIs doesn't use INDEX at all (port 3).
- NMI isn't blocked by `SEI`. An NMI handler must not use INDEX unless it saves and restores it (INDEX is readable).

Setting up a handler:

```asm
        PHP
        SEI
        LDA #$08+3    : STA IMU_INDEX   ; PRIO 3
        LDA #2        : STA IMU_DATALO
        LDA #$18+3    : STA IMU_INDEX   ; HBANK 3
        LDA #0        : STA IMU_DATALO  ; staged
        LDA #$10+3    : STA IMU_INDEX   ; HANDLER 3
        LDA #<HANDLER : STA IMU_DATALO  ; staged
        LDA #>HANDLER : STA IMU_DATAHI  ; commit (handler and bank)
        LDA #$00      : STA IMU_INDEX   ; CTRL
        LDA #$80      : STA IMU_DATALO  ; enable
        PLP

HANDLER PHA
        ...                             ; acknowledge the device (it releases its line)
        STA IMU_EOI
        PLA
        RTI
```

A long handler that lets higher priorities in acknowledges its device, then does `CLI`, and only EOIs at the end.

## Choosing priorities

Rank sources by how little delay they can tolerate, not by how important they seem. Sources with tight deadlines
and short handlers go high, slow ones go low.

- Mockingboard: tight deadline (sample playback at several kHz; a music tick tolerates a little jitter), short
  handler (a few AY register writes). **High.**
- Mouse: loose deadline (a cursor one frame late is invisible). Drawing a hires cursor is thousands of cycles.
  **Low**, and `CLI` early if it draws in the handler.
- Better still, the mouse handler only records the position and sets a flag, and the main loop draws the cursor.
  That avoids racing the main program on the screen.

## Interfaces

```ts
// IBus: optional hooks, absent on machines without an IMU
interface IBus {
	/** IRQ only, never BRK / NMI. After the pushes; `sp` = SP after them.
	 *  The handler of the winning ID, or undefined to fetch $FFFE/F. */
	irqVector?(sp: number): number | undefined;
	/** On every RTI, after the opcode fetch, before the pulls; `sp` = SP before the pulls. */
	onRti?(sp: number): void;
}

// Implemented by the machine (its MMU). Optional: without it, HBANK is ignored.
interface InterruptContext {
	/** After the pushes, before the handler's first fetch: switch to `bank`.
	 *  Returns the state to restore, a number so it fits in a save state. */
	enter(bank: number): number;
	/** On the matching RTI, before the pulls: restore. */
	exit(saved: number): void;
}

class IMU {
	constructor(opts: { irq(active: boolean): void; context?: InterruptContext });
	setLine(id: number, active: boolean): void; // the devices
	read(offset: number): number;
	write(offset: number, value: number): void;
	irqVector(sp: number): number | undefined;
	onRti(sp: number): void;
	reset(): void;
	// save state: CTRL, MASK, handler table (lo, hi, bank, prio), INDEX, staged low byte and banks, ISR, frames
}
```

`irq` drives the CPU's IRQ line, `InterruptLines.irq` as today: the IMU becomes the element that ORs the devices
in place of `AppleBus.updateIrq` / `PetBus.updateIrq`.

## Changes

- **CPU** (`cpu.65c02.ts`):
  - `serviceInterrupt`: for an IRQ, `to = bus.irqVector?.(sp) ?? read($FFFE/F)`. Trace: `IRQ#n` when vectored.
  - `RTI` (`0x40`): `bus.onRti?.(sp)` before the pulls.
  - Nothing else: the I gating, NMI, BRK, hypercalls and step out are unchanged.
- **IMU**: `src/machines/chips/imu.ts`, next to `via6522.ts` / `pia6821.ts`: shared by the machines, and wired like
  them.
- **Apple //e**: ID n = slot n (1–7), IDs 0 and 3 free for now (slot 3 never holds a card). `updateIrq` becomes
  `imu.setLine(slot, card.irq)`. The registers at `$C0B0`–`$C0BF` (see below). The
  bus implements `irqVector` / `onRti` by delegating, and later passes the MMU as the `InterruptContext`.
- **PET** (optional): ID 0 PIA1, ID 1 PIA2, ID 2 VIA.
- **Save state**: the IMU's state in the machine's `MachineStateSpec`.
- **Debugger / MCP**: show CTRL, MASK, PENDING, INSERVICE, CURRENT, the handler table and the frames. For example
  a `get_interrupts` MCP tool and a panel in the UI.

## Tests

- IMU: arbitration (mask, priority, ties), fully nested blocking, EOI, auto-EOI, commit on DATA HI (with the
  bank), 8-bit registers ignoring DATA HI, reserved registers and ports, fallback for `$0000`, transparent when
  disabled, reset.
- CPU: a vectored IRQ (7 cycles, frame, I set, D clear), fallback to `$FFFE`, BRK never redirected (hypercalls
  included), NMI unchanged.
- RTI matching with a fake `InterruptContext`: enter / exit order around the pushes and pulls, nested IRQs, an
  RTI used as a jump passes through, an abandoned frame is dropped.
- //e: Mockingboard in slot 4 vectored, a card without a handler falls back to `$3FE`.

## //e placement of the registers

**Decided: `$C0B0`–`$C0BF`, slot 3's device-select space** (`$C0B0 + offset`). Always there, no card to install.

- Not a slot card: it would cost one of the six card slots.
- Not slot 0 (`$C080`–`$C08F`): the language card uses all 16 addresses. The rest of `$C000`–`$C07F` is soft
  switches, annunciators, paddles and `$C073` (RamWorks): only scattered holes.
- Slot 3 is free: on a //e the 80-column card sits in the aux slot and only uses soft switches in `$C00x`/`$C01x`,
  never `$C0Bx`. In vm6502, slot 3 can't hold a card (`CARD_SLOTS` in `conf/slots.conf.ts`), so `$C0B0`–`$C0BF`
  reads 0 and ignores writes today.
- 16 addresses, the IMU's offsets: the bus forwards `address & $0F` with no further decoding. Only `$C0B0`–`$C0B3`
  are used (INDEX, DATA LO, DATA HI, CURRENT / EOI), the rest stays reserved.
- Risk: ][+ software for an 80-column card in slot 3 (Videx Videoterm, Sup'R'Terminal) programs its CRTC at
  `$C0B0`/`$C0B1`. It first checks for the card's ID in `$C3xx`, which on a //e is the internal 80-column
  firmware, so it doesn't get there.
- Consequence: slot 3's I/O space is reserved for the IMU. If slot 3 ever takes a card (with `SLOTC3ROM` on), its
  `readIo` / `writeIo` won't be reached.

## Open questions

- **ID 0 and ID 3 on the //e:** a VBL tick? Something else?
- **Auto-EOI:** keep it, or require explicit EOI only?
- **NMI through the IMU:** out of scope for now.
- **The //e MMU:** what HBANK means, and how `enter` / `exit` switch maps. To be defined with the MMU.
