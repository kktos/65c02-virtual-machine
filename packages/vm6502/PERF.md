# Performance: how the emulator was made faster, and what's next

Status: three steps done (PRs #140, #141 and the CPU registers one). Conan (`conan/dist/new_conan.po`) at "Max"
speed went from ~38 MHz to ~160 MHz in the browser, and from 42 to ~220 MHz headless. This file covers how to
measure, the rules the optimizations rely on (don't break them), and the ideas left, ranked.

## Measuring

**Use the bundled benchmarks, never vitest, for speed.** Vitest rewrites every import into a getter call
(`__vi_import_0__.REG_A_OFFSET`). On this code that made the CPU core look 5× slower (51 vs 246 MHz) and gave
misleading profiles. `scripts/bench-cpu.mjs` bundles with vite (as the browser build does), then runs Node:

```sh
pnpm bench:cpu [seconds]                         # CPU core alone: Klaus 65C02 test looped on a flat 64K bus
pnpm bench:cpu apple <disk.po> [seconds]         # Apple //e booting that disk, real AppleBus, max speed
pnpm bench:cpu apple <disk.po> cycles=N          # checksum of memory + registers after exactly N cycles
pnpm bench:cpu apple <disk.po> 5 -- --cpu-prof --cpu-prof-dir=<dir>   # Node flags after `--`
```

- A relative `<disk>` resolves from where pnpm was run. From `packages/vm6502`, Conan is
  `../../../conan/dist/new_conan.po`.
- The core benchmark throws if Klaus's test traps anywhere but its success address, so it also checks every
  opcode, decimal mode included.
- **The checksum is the safety net for any change to the CPU or the bus.** Run `cycles=20000000` and
  `cycles=200000000` before and after the change; the checksums must match. Conan's reference values, unchanged
  through all three steps: `46c7f4b6` (20M, which stops at 20000001) and `2337e944` (200M). The run includes the
  boot and the disk reads through SmartPort. Conan's hot loop is its cycle-counted `utils.wait` (`$D8A0`), so at
  max speed the game's pace scales with MHz.
- Conan uses neither the //e timer nor the Mockingboard, so the checksum doesn't exercise them. Their unit tests
  cover them (`tickBatching.test.ts`, `timer.test.ts`, `mockingboard.test.ts`).
- To turn a `.cpuprofile` into a self-time table, read its `nodes` / `samples` / `timeDeltas`: a short Node script
  that sums `timeDeltas` per `callFrame.functionName`. Line numbers point into the bundle, which the bench writes
  to `$TMPDIR/vm6502-bench-*/`.
- `-- --trace-opt --trace-deopt` shows whether a function gets TurboFan. The ~2,300-line `execute` does: after a
  few early de-optimizations (new opcodes met), it stays optimized. Its size is not a problem.
- The browser number is what the UI shows (`REG_SPEED_OFFSET`). Headless doesn't account for the frame drawing
  or the main thread. Headless 196 MHz showed as ~96 MHz in the browser before the run loop fix, and as ~160 after.

## History

| Step                           | Headless (Conan)            | Browser | What                                                                 |
| ------------------------------ | --------------------------- | ------- | -------------------------------------------------------------------- |
| start                          | 42 MHz                      | ~38 MHz | every device ticked after every instruction                          |
| 1a. batched ticks (#140)       | 125                         |         | `AppleBus` ticks devices lazily                                      |
| 1b. silent Mockingboard (#140) | 196                         | ~96     | its AYs rendered silence, 34% of the time                            |
| 2. run loop (#141)             | 196                         | ~160    | max speed: 8 ms slices through a MessageChannel, not `setTimeout(0)` |
| 3. CPU registers               | 220 (core alone: 240 → 288) |         | registers in variables while executing                               |

The profile at the start, Conan at max speed (self time): CPU ~42%, mouse + joystick input polling ~16%,
Mockingboard VIAs + AY render + mix ~18%, speaker ~5%, tick handler dispatch ~9%.

## Rules the optimizations rely on

### Device ticks are batched (`AppleBus`, step 1)

- `bus.tick(cycles)` only adds to `totalCycles`. A handler gets the cycles that went by since its last call, in
  batches of at most `MAX_TICK_BATCH` (1024) cycles. It is called sooner in three cases:
    - **at its event:** `registerTickHandler(handler, nextEvent)`, where `nextEvent()` gives the cycles until it
      must be ticked (an interrupt), measured from its last tick. This is how an IRQ lands on the same instruction
      as before. The VIA, the Mockingboard and the //e timer implement it.
    - **before an access to its I/O:** `ioSync`, per `$C000-$CFFF` address. `SYNC_SPEAKER` (`$C030-$C03F`) syncs
      only the speaker. `SYNC_ALL` covers the buttons and PTRIG (joystick polling), the IMU, and the `$C0n0` /
      `$Cn00` spaces of a card that ticks or a device's registers and switches. After a `SYNC_ALL` access, the next
      batch is rescheduled (the access may have moved an event).
    - **before a save state, the debugger's interrupts view, and `syncState`.**
- **A new device that counts cycles must:** register through `registerTickHandler`. If it raises IRQs, implement
  `nextEvent`. Its I/O must be flagged in `ioSync`; `installCard` / `installDevices` do it for `tick`ers. It must
  also accept a large `cycles` value (catch up several periods at once: `while`, or `%`).
- Keyboard (`$C000`) and VBL (`$C019`) reads stay on the fast path. Don't flag them; Conan polls them.
- Input polling (mouse, joystick) every ≤1024 cycles is fine: host input is asynchronous anyway.
- An AY with all three volumes at 0 doesn't render, and its oscillators don't advance. Their phases aren't
  visible to the program, only to the ear.

### Run loop (`cpu.65c02.ts`, step 2)

- At max speed, a slice runs for `MAX_SPEED_SLICE_MS` (8 ms). The clock is read every 20k cycles, and a slice
  stops at 4M cycles in any case (for tests whose clock doesn't move). The next slice is posted on a
  `MessageChannel`. **Don't go back to `setTimeout(0)` at max speed:** browsers clamp nested timers to ~4 ms,
  about as long as a slice, so it halved the speed.
- At a set speed, `setTimeout` stays: slices are sized by the time gone by, so the clamp costs nothing.
- If the `requestAnimationFrame` callback hasn't drawn for 50 ms, the run loop draws a frame itself.
- `runGeneration`: each `setRunning(true)` starts a new loop, and the slices and frames of older ones are dropped.
- **Tests that drive the loop** must stub `MessageChannel` (`NoSliceChannel`, in `cpu-test-helpers.ts`) as well
  as `setTimeout` and `requestAnimationFrame`. Otherwise Node's real channel keeps the loop running.

### Registers (`cpu.65c02.ts`, step 3)

- While the CPU executes (`registersLive`: inside `runCycles` or `executeInstruction`), the registers are the
  module variables `regA`, `regX`, `regY`, `regSP`, `regP`, `regPC`. Otherwise the shared view is the truth.
    - `loadRegisters` runs at the start of a slice or step; `storeRegisters` at its end, and before anything posts
      a stop (`setRunning(false)` stores them if live).
    - Code that stops the machine in the middle of an instruction sets `regPC = pc` first, so the stop posts the
      right PC.
    - The hypercall decoder reads the view, so the registers are stored before it runs.
- `regPC` is still the address of the instruction being executed. The new PC is written in `execute`'s `finally`.
- **A device that reads or sets CPU registers during an instruction** must use `CpuRegisters`
  (`cpuRegisters.ts`), given by the CPU through `bus.setCpuRegisters` → `card.setCpuRegisters`. Never use the view
  for this: it is stale while running, and the CPU would overwrite a change made there. SmartPort and the mouse
  card do this (their `cpu` getter falls back to the view when no CPU is attached, e.g. in unit tests).
- All register writes are masked (`& 0xff`, `& 0xffff`): `setUint8` used to truncate for free.
- Accepted change: a register edited from the debugger while running is kept only if it lands between two slices
  (≤8 ms).
- `executeInstruction` loads and stores the registers on each call (single steps, tests). The hot path is
  `runCycles`; the benchmarks use it too.

## Where the time goes now (Conan, headless, ~220 MHz)

`execute` ~59%, `bus.read` (the breakpoint wrapper + `AppleBus.read`) ~20%, `runCycles` ~14%, the rest small.

## Next, ranked

1. **Memory reads.** `initCPU` replaces `bus.read` / `bus.write` with closures that check `breakpointMap` on every
   access, and then call the bound original. Two changes:
    - Keep direct references to the original read/write. Switch to the checking versions only while a read/write
      breakpoint exists (a counter in `breakpoints.ts`). Opcode fetches (`isOpcodeFetch`) don't need the check
      at all.
    - `AppleBus.read`/`write`: a 256-page table (offset into `memory` per page for read, and one for write; -1 for
      I/O or ROM handlers), recomputed when a memory switch changes (RAMRD/RAMWRT/ALTZP/80STORE/PAGE2/HIRES,
      language card). The read becomes `page >= 0 ? memory[page + (addr & 0xff)] : slowPath(addr)`. Watch out:
      80STORE+PAGE2 (+HIRES) override RAMRD for `$400-$7FF` / `$2000-$3FFF`, LC bank 2 at `$D000-$DFFF` lives in
      separate arrays (`bank2` / `auxbank2`), and `$CFFF` / slot ROM selection has side effects.
    - Check: checksum + Klaus + `boot.test.ts`, `saveState.test.ts`, `peek.test.ts`.
2. **Per-instruction overhead in `execute`:**
    - The PC breakpoint check (`breakpointMap[pc] & BP_PC`, `resumeFromBreakpointAt`): one typed array read,
      acceptable.
    - `instructionTraceOn`, `runningBefore` / `stepStopBefore`, the `try/catch/finally`, the IRQ test at the end.
    - Possible: a fast `execute` variant used when nothing is armed (no breakpoints, no trace, no step out),
      chosen per slice. Measure first.
3. **Speaker at max speed.** It still produces samples at the emulated rate (~200× real time). They're cheap now
   (~1%), but they are posted to the main thread, which drops them. Could skip generating them at "Max".
4. **Frame drawing in the worker.** `video.tick` runs on the worker's frame callback, so it competes with the CPU.
   It only matters in the browser; measure there.
5. **`AppleBus.tick` dispatch**: already ~1%. Leave it.
