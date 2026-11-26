# CHANGELOG

What's been done (from TODO.md and the `VirtualMachine` code review). Still open: `TODO.md`. The MCP server's: `MCP_CHANGELOG.md`.

### 2026-11-25

Code review of the `VirtualMachine` class (`virtualmachine.class.ts` at `d0f383b`, with what it needed of
`cpu.worker.ts`, `cpu.65c02.ts`, `keyboardJoystick.ts` and the callers): 15 findings, all done (PRs #147–#154, the
last merged 2026-11-26).

- **FIXED** a machine that failed to start left `ready`, and every request after it, pending forever (an MCP tool that
  never returns, no "could not start" toast): `loadBus` returned on a missing bus module / class, `ready` resolved
  with no bus and the worker never got `init`; a worker `init()` that failed set `initState = "failed"` and told no
  one (#147)
    - `loadBus` throws; the worker posts `initFailed` and answers the queued requests with an error; the main thread
      rejects `ready` and the pending requests
- **FIXED** `terminate()` left the requests under way unanswered (an MCP `step` / `reset` / `saveState` in flight when
  the machine is switched) (#147)
    - `requests` holds `{ resolve, reject }`; `terminate()` rejects them (`"VM terminated"`) and the ones after it
- **FIXED** Ctrl/Cmd + a joystick key left the key down on the machine until the page lost focus: the keydown skipped
  the joystick (modifier held) and went to the worker, the keyup was taken by the joystick (no modifier check). Same
  when turning the keyboard joystick on with an arrow held (#147)
    - the codes whose keydown went to the worker always get their keyup there, whatever the joystick does
- **FIXED** `initVideo` called twice (`App.vue`, `useMachine.ts`) leaked a `VideoOutput` and started a second
  `requestAnimationFrame` loop (#147)
    - it destroys the previous output first, and starts the frame loop only when it isn't running
- **FIXED** trace overflow missed: detected by comparing `JSON.stringify(history[0])` between polls, which tight loops
  (identical JSR entries) fool once the ring buffer wraps (#151)
    - the worker counts the entries logged since the last clear (`getTraceTotal`) and sends that `total`; an overflow
      is the entries dropped (`total - history.length`) growing since the previous poll. The first poll after a
      clear / restart only sets the baseline
- **DONE** one class did too much (worker RPC, audio, DOM keyboard / paste listeners, joystick, video, trace, registers,
  memory, CSS / fonts) (#148)
    - `workerClient.class.ts` (request / reply, dispatch, teardown), `audioSink.class.ts`,
      `inputController.class.ts`; `VirtualMachine` keeps its public API and delegates. Video, trace and registers stay
- **DONE** the class depended on Vue and global app state: `traceOverflow` / `videoAspect` were `ref()`s, the
  constructor called `useMemoryMap().clearRegions()` (#149)
    - plain getters with `onTraceOverflow` / `onVideoAspect`, hypercalls out through `onHypercall`. `useMachine`
      resets the memory map, mirrors the two values into refs and wires `applyHypercall` (moved from
      `virtualmachine/hypercall.ts` to `lib/hypercallEffects.ts`). Nothing in `virtualmachine/` imports Vue or a
      composable
- **FIXED** module-level audio state: `audioCtx` / `nextStartTime` shared by every VM and outliving `terminate()`, the
  chunks scheduled played on after teardown, the schedule carried over to the next machine (#148)
    - an `AudioSink` per VM; `terminate()` stops what it queued. The `AudioContext` stays shared (browsers cap them,
      and once unlocked by a gesture it stays usable)
- **FIXED** register writes lost while running (the CPU keeps them in locals, `registersLive`), and nothing said so
  (#150)
    - `updateRegister` / `restoreRegisters` throw while running or starting (`assertPaused`); `pauseAndWait()` (the
      worker answers `pause`). The console's G wrote SP / PC into the shared buffer even when running: it now pauses,
      writes through `updateRegister` and resumes
- **FIXED** worker messages mixed two discriminators: `setPalette` / `setViewRect` came with `command` and fell into
  `default`; the `break` / `breakpointHit` cases did what `default` does (#151)
    - every video (Apple, PET, Klaus) posts them with `type`, own cases; the redundant cases gone. Klaus's per-frame
      `{ command: "syncState" }` (never fired, never handled) removed
- **FIXED** the generic VM hard-coded the Apple font: `loadCSS` checked `"16px PrintChar21"` after every CSS file,
  whatever the machine, and logged `Font loaded:` (#150)
    - removed: the Apple's bus (`generateApple2Assets`) and its video already wait for their own fonts
- **FIXED** nits (#152)
    - the "last `count` instructions recorded" doc comment moved from `getInterrupts` to `getInstructionTrace`
    - the register stack holds `readRegisters()` objects (was a positional `number[]`); `P` writes keep
      `FLAG_B_MASK | FLAG_5_MASK` (was `0x30`), the flag masks a module constant
    - `loadBus` indexes the module by the class name; `checkedRequest` unwraps `error` for the keyboard and
      save-state requests
    - every member is a method (no arrow-function fields); `sharedBuffer`, `videoBuffer`, `videoMemory` private, the
      fields set once `readonly`
- **FIXED** `read()` went through the main thread's copy of the bus, so a look at `$C0xx` flipped that copy's soft
  switches until the next `syncBusState`: `PEEK($C055)` turned `page2` on (80STORE: `[$400]` read aux), `gl
  c000.ffff` switched the language card, `$Cnxx` set `activeExpansionSlot` (never reset), and the copied devices'
  I/O isn't the machine's (#153)
    - `VirtualMachine.read` removed. The expression's `[addr]` / `PEEK` and a virtual register's `r` mode read with
      `peek`; the one-byte `hexdump` and `gl` with `readDebug`; `disassembler.ts` takes the read it's given. A real I/O
      read (a VR on a soft switch) would need a worker round trip: not done, `peek` gives 0 there
- **FIXED** callers wrote `sharedRegisters` directly, past `assertPaused`: `set A $12`, `run <address>`, the
  expression's `INC` lost their write on a running machine, silently (#154)
    - `writeRegister(view, reg, value)` in `shared-memory.ts`, next to `readRegisters`; `updateRegister` /
      `restoreRegisters` use it. `set <reg>` pauses, writes, runs on (as G); `run <address>` pauses first; `INC`
      throws on a running machine. Readers (expression registers, `handleJsrOutput`, MCP `describeRegisters`) use
      `getRegisters()`; `sharedRegisters` private. `set P` keeps B and bit 5, like the other `P` writers
    - test fakes: `fakeRegisters()` (`lib/tests/fakeRegisters.ts`); tests for `set` / `run` while running and `INC`

### 2026-11-15

- **FIXED** hypercalls from the aux language card (or aux zero page / stack) don't run: the BRK stops as a plain BRK.
  Noticed rehosting Captain Goodnight, whose tiny-dos runs in the aux LC (ALTZP on, `$D000`): its `dbgAddMemRegion`
  (`BRK $03`, `ADD_REGION`) at `$01:D1F9` stopped the boot with "brk", where the disassembler shows `!!ADD_REGION`
    - `cpu.65c02.ts` (BRK): `decodeHypercall` reads through `bus.readDebug(address)`, with 16-bit addresses
    - `apple.bus.ts` `readDebug`: a 16-bit address is the main bank, whatever ALTZP (and RAMRD / 80STORE) say. For
      `$D000-$FFFF` its default path reads `bank2` / main RAM: the CPU fetched the BRK from aux LC, the decoder
      reads main LC's bytes there, sees no hypercall byte
    - fix: the CPU decodes through `bus.peek` when the bus has one: `read`'s banking (ALTZP, RAMRD, 80STORE + PAGE2
      / HIRES, LC bank), `readDebug` on `$C000-$CFFF` so no soft switch is triggered. Not
      `readDebug((getBank(a) << 16) | a)`: `getBank` ignores 80STORE. Tests: `hypercall.test.ts` (real //e bus, call in
      aux LC with ALTZP on, its string in main RAM), `peek.test.ts` (aux LC, 80STORE), `brk.test.ts` (`peek` first)
    - captain-goodnight's tiny-dos can call `dbgAddMemRegion` again

- **FIXED** disassembly, jump history: after a Ctrl+click on a label, Back was sometimes disabled though the previous
  address was in the history (Back to A, then Ctrl+click from A: A matched the last entry, the index stayed at 0)
    - `useAddressHistory.ts`: `historyIndex` is the current entry (-1: empty), was one past the end; an address is
      skipped only when it is the current entry, the forward entries are dropped before it is added
    - a jump records where the view was, then where it goes (`trackLocation` / `recordJump`): Back from the first
      jump returns to its origin. Ctrl+click, the goto box, xref / procedure panels, the stack view, `disasmView`
    - `ProcContextFloatPanel.vue`: a leftover `jumpToAddress(0x2000)` (and `console.log`) before each jump, removed
- **DONE** disassembly, Ctrl+click follows on mousedown (on macOS Ctrl+click is a right-click, no `click`); Ctrl+hover
  underlines what it follows; `JMP (abs)` / `JMP (abs,X)` follow the pointer; ZP / `(zp)` operands open the memory view

- **DONE** disk editor, new disk and copying files: a DOS 3.3 disk doesn't boot (no Disk II, on purpose), its files
  copied to a ProDOS volume do
    - "New disk": a blank ProDOS volume (140K / 800K .po, 32MB .hdv), its boot blocks from a library disk or none;
      in the library, opened (`DiskNewPanel.vue`, the format's `newDisks` / `create`)
    - files ticked in a directory (or a file's "Copy to…"), to a library disk and one of its directories
      (`DiskCopyPanel.vue`): the source's `exportFile` gives the bytes and a ProDOS type, the target's
      `target.addFiles` writes them; saved to the library, the editor reads it again
    - `prodos.write.ts`: blank volume, seedling / sapling / tree files, a full subdirectory grows a block; names made
      ProDOS ones (`SOUND EDITOR 3.0` -> `SOUND.EDITOR.3`); a name taken, a full disk: refused, nothing written
    - DOS 3.3 -> ProDOS: B -> BIN at its address, A -> BAS $0801, I -> INT, T -> TXT (to the first $00), R -> REL
    - checked: PRODOS + BASIC.SYSTEM + a DOS 3.3 Applesoft HELLO copied to a new volume, it boots, CAT / LIST fine

- **DONE** disk editor, machine agnostic: it knew only Apple disks (DOS 3.3, ProDOS, 35 x 16 sectors) and showed
  every viewer, HGR on a PET too. The machine's config now names them (`disk.formats`, `disk.viewers`)
    - `lib/disk/diskFormat.type.ts`: what the editor shows of a disk (`OpenedDisk`): raw layout (tracks from 0 or 1,
      sectors per track, blocks or not), a tree of directories / files by ids, a volume map, what each sector holds
    - `lib/disk/formats/`: `apple2` (what `analyzeDisk` found, the sector order as a "reading" choice) and `cbm`
      (D64: BAM, flat directory, PRG load address, PETSCII names, decimal T/S)
    - `app/diskeditor/viewers/index.ts`: hex (always there), hgr, disasm; a viewer can ask for more than a sector (HGR: 8K)
    - the editor lists the library disks of the machine's drive only

Noticed while running `mock mini prodos T.dsk` (asimov `images/sound/`, a Mockingboard sample player: silent):

- **FIXED** console, `Worker: Not initialized` on each power on (`setDebugOverrides`, `setTraceSize`, `getTrace`):
  `DiskDriveLogs.vue` / `TraceView.vue` send them from an immediate watcher on `vm`, before the worker has its
  `init` (sent once the bus is loaded on the main thread), so they were dropped. Harmless as the values sent were the
  defaults, but a disk logging switched on at mount was lost. And a command coming while `init` was still loading
  the bus passed the check (`sharedBuffer` was set) and hit a `null` bus
    - `cpu.worker.ts`: what comes before `init` is done is queued, run in order once it is, then `ready` is posted;
      an `init` that failed drops the queue and refuses what comes after
- **DONE** Mockingboard slot: the card is in slot 7 (`MOCKINGBOARD_SLOT`, `apple.bus.ts`) because the mouse
  (`MouseCard`) is in slot 4, the Mockingboard's usual one. Software written for slot 4 doesn't find the card
    - the disk's player (`V15`, at $758A) has `$C4` hard-coded in 23 `STA` / `STY $C4xx` (both VIAs, $C400 / $C480);
      the BASIC's `POKE 30117,4` isn't the slot but the T1 latch low byte. Patched to `$C7` (23 POKEs of 199 after the
      `BLOAD V15`), its IRQ runs (the sample pointer moves) — whether it is heard there was not checked
    - decided: the slots as a machine setting, see below
- **DONE** slots, which card in which slot, set by the user (the //e; the default layout unchanged: clock 2, mouse 4,
  SmartPort 5, Mockingboard 7). A change power-cycles the machine (as swapping real cards: power off first)
    - `MachineConfig.slots` (`types/machine.interface.ts`): how many slots, the cards the machine takes (id, label, the
      slots each goes in), the default layout. None: no slots (the PET, KlausTest). The //e's: `conf/slots.conf.ts`
      (no card in slot 3: the 80-column firmware)
    - `apple.bus.ts`: `CARD_FACTORIES` builds a card by its id; the bus takes the layout as `BusOptions.slots`
      (`new BusClass(memory, options)`, on both threads: `VirtualMachine.busOptions`, then the worker's `init`).
      A disk with no `slot` goes to the first card that takes one (was slot 5, `DISK_SLOT`)
    - `lib/slots.lib.ts`: checking / merging a layout; `composables/useSlots.ts`: the user's, by machine, in
      localStorage (`vm6502_slots`), read by `loadMachine`
    - UI: `SlotsControl.vue` (toolbar, circuit-board icon, the machines with slots only): a select per slot, Defaults,
      Apply & power cycle
    - MCP: `get_slots` (`count` 0: no slots), `set_slots` (slot → card id / null, `default: true`), saved as the UI's

Noticed while chasing the squares shown instead of `@` on a page refresh (//e, text renderer "Font"):

- **FIXED** text, "Font" renderer: on a refresh the screen showed missing glyph boxes instead of `@`, often, and for
  good (a redraw seconds later still drew them). The worker loads its own `PrintChar21` / `PRNumber3`
  (`loadFont`, `apple.video.ts`), not awaited, so the first frame (the machine paused at reset) set `ctx.font` before
  they were in: the OffscreenCanvas context resolved it to a fallback font, which has no glyph for the private use
  code points of `appleCharCodeToUnicode` ($00 -> U+E140), and kept it once the fonts were loaded (cached by
  context and font string). Not the main thread: its atlas (`generateApple2Assets`) was fine every time
    - `text.ts`: `render40WithFont` / `render80WithFont` draw nothing until `setFontsReady()`
    - `apple.video.ts`: `loadFont` returns its promise; once both are in, `setFontsReady()` then a redraw (`tick()`)
- **FIXED** text, "Bitmap" renderer: `render40Bitmap` / `render80Bitmap` drew into the OffscreenCanvas but never called
  `copyToBuffer()`, so nothing of it reached the screen (unlike the "Font" ones). Its atlas didn't fit either (21px
  glyphs in 16x22 cells, scaled down to 14x16; plain ASCII only: no inverse, flashing, mouse text)
    - `video/charset.ts`: `appleCharCodeToUnicode` (shared), the glyphs (256 + the alt charset's 32 mouse text ones),
      a code -> glyph table per charset state (normal / flash phase / alt), as the "Font" renderer chooses them
    - `bus/apple.assets.ts`: the main thread draws each glyph once, same fonts and size as the "Font" renderer
      (16px, top-left), into a 1-bit mask (14x16 for 40 columns, 7x16 for 80)
    - `text.ts`: the "Bitmap" renderers write palette indices straight into the buffer (`blitGlyph`): no canvas,
      no `getImageData`, no colour matching
    - debug bar: the text renderer and its time per frame (`FNT 2.38` / `BMP 0.37`, ms, moving average) when text
      is on screen. Measured, same screen, running: 40 col FNT ~2.4 / BMP ~0.37 ms, 80 col FNT ~2.6 / BMP ~0.38 ms
- **FIXED** `loadFont` (`apple.video.ts`): the font URL is built from `import.meta.url.match(/http:\/\/[^/]+/)`, http only.
  Served over https, `baseurl` is undefined and `new URL("undefined/fonts/...")` throws in the `AppleVideo`
  constructor. `new URL(`fonts/${name}.ttf`, self.location.href)`? (Vite's `base` is `./`)
    - not relative to `self.location.href`: that's the worker script, the font would be looked for next to it
      (`assets/`, `src/virtualmachine/cpu/`). Root-absolute like `fonts.css`: `new URL(`/fonts/${name}.ttf`,
      self.location.href)`, built inside the promise so a bad URL is a warning, not a constructor throw
- **FIXED** `virtualmachine.class.ts`: `loadCSS()` (the `@font-face` of `fonts.css`) isn't awaited before `loadBus()`, which
  draws the 40/80 column atlases (`generateApple2Assets`, `document.fonts.load(...)`). If the CSS came last,
  `fonts.load` would find no face and resolve at once, drawing the atlas with a fallback font. Always in order so
  far, by luck: await `loadCSS()` before the payloads
    - `ready = loadCSS().catch(warn).then(loadBus)`: a CSS that fails to load doesn't stop the machine

### 2026-11-13

Noticed while chasing the speaker's sound (Conan late, Karateka silent):

- **FIXED** speaker, sound lagging further and further behind the game (seconds, then minutes): the samples were
  made from the emulated cycles at a fixed 1.023 MHz whatever the clock speed (at 2.8 MHz, ~2.7 s of sound per
  second), and the main thread queued every chunk after the previous one, never dropping any. Karateka's title
  music did toggle `$C030` (`$0D70` / `$0D86`), but played at the end of that queue: silent in practice
    - `speaker.ts`: samples at the pace of the clock the CPU runs at (`setClockSpeed`, from the worker's `setSpeed`;
      "Max" assumes 1.023 MHz). Faster than 1 MHz the pitch goes up, like an accelerator card with no slowdown
    - `virtualmachine.class.ts`: at most 150 ms of sound queued ahead (the extra chunks dropped), 30 ms of
      prebuffer after an underrun
- **FIXED** a hook `log spk PC;run` (on an `access` `$C030`-`$C03F` range) stopped the machine on each hit, as a
  plain breakpoint: not the range, but `log` refusing a first arg that is a name (`log spk PC`, `log spk A X+1`:
  "Unknown subcommand"), so the `run` after it never ran
    - `log.cmd.ts`: a first arg that isn't `open` / `close` / `clear` is logged by its value, like the others
- **FIXED** `log`: the values were logged in decimal (`log spk PC` gave `64098`), where the rest of the debugger
  shows hex; and a first value of 0 (`log spk 0`) logged nothing, taken as no args (only opened the window)
    - `log.cmd.ts`: whole numbers >= 0 in hex, by size (`$03`, `$FA62`, `$01C030`); the others as they are
- **FIXED** stack view flickering: a JSR row (`$00:01F5 │ 34 │ $00:1234:JSR $00:5678`, ~270px) didn't fit the
  16rem column, so the horizontal scrollbar came and went as return addresses showed up (every 250 ms tick)
    - `StackView.vue`: addresses without the bank (`$01F5`, `$1234:JSR $5678`; the tooltips keep `$00:xxxx`),
      horizontal overflow hidden

### 2026-11-09

- **DONE** disk editor: a floating window (`useFloatingWindows.ts`) to look inside a disk image from the library
  (`DiskDriveControl.vue` / `useDiskDrive.ts`), without booting it. The view depends on the disk's format:
    - DOS 3.3 with a catalog: VTOC, catalog, files (T/S lists), open a file's sectors
    - DOS 3.3 without a catalog (custom DOS, games): raw tracks / sectors (35 x 16 x 256)
    - ProDOS: volume directory, subdirectories, files (seedling / sapling / tree), raw blocks (512 bytes)
    - hex + ASCII dump (high-bit ASCII), track / sector or block navigation, the sector ordering (.dsk / .do / .po)
    - `DiskEditor.vue` (`app/diskeditor/`), opened from a library disk's "look inside" button or `show disk_editor`;
      parsing in `lib/disk/` (sector order detected, a .2mg header's taken; VTOC / bitmap maps show what holds each
      sector / block)
- **DONE** disk editor, viewers: the bytes of a file / sector / block shown as a hex dump (default) or an HGR
  picture (`DiskViewerSwitch.vue`, `DiskHgrView.vue`, rendering in `lib/disk/hgrImage.utils.ts`): color or mono; a file
  as loaded, raw sectors / blocks 8K from the one shown (Page Up / Down to align a picture)
- **DONE** HGR viewer, RLE-packed pictures (`$FE` runs, Conan's `unpack.asm`): `lib/disk/hgrRle.utils.ts` detects the
  variant (`FE value count` / `FE count value`, by columns / by lines) and the height (183 for Conan's backgrounds);
  unpacked on its own when shorter than a screen, or set by hand. Line by line, the height isn't detected (what
  follows the picture shows below it). A picture inside a file (WELCOME.DATA's second one) isn't looked for
- **DONE** disk editor, disassembler viewer (`DiskDisasmView.vue`, `lib/disk/disasmBytes.utils.ts`): 65C02, from the load
  address (Org editable), labels on / off, jumps inside the bytes as links; boot sector / block 0 at $0800, code
  from $0801. The debugger's disassembler with `detached` (no data formats, comments, hypercalls: they belong to
  the memory at those addresses) and `labels: false`
- **DONE** HGR viewer, sprites: a width in bytes (40, the default: the screen page, interleaved; less: rows one
  after the other, as sprites are stored), bytes skipped before the first row, zoom x1-x8 (`renderHgrRows`)

Noticed while adding Karateka's upside-down mode (a key held at boot):

- **FIXED** //e keyboard: reading `$C010` returns 0 (`apple.switches.ts`), where a //e gives AKD in bit 7 (1 = a key is
  down now, the `consts` comment says so). Software that checks "a key held" through `$C010` never sees it.
  Needs a key-down state from keydown / keyup (the worker gets both), and auto-repeat for a held key (the latch
  set again while it stays down)
    - `bus/apple.keyboard.ts`: `$C010` reads AKD and the latch. Down: a real key (keydown / keyup, all up on blur),
      the key held by `key hold` / `hold_key` (repeating, ~0.5 s then 15/s), a typed key until it is consumed
    - typed keys (paste, `type_keys`, `key "text"`) are queued in the worker and given to the program as it reads
      `$C000`, `key delay <cycles>` after it consumed the previous one; paused, they wait
- **FIXED** the //e's `$C011`-`$C01F` reads have the keyboard latch in their low 7 bits; ours read 0 there
    - `apple.switches.ts`: `flagWithLatch()` gives the status in bit 7 and the latch (no strobe) in bits 0-6

### 2026-11-08

Noticed while porting Karateka to a .po (its loader disassembled in the debugger):

- **FIXED** disassembler, labels with an offset: offsets >= 0 only, in hex (`+$0C`); LABELS takes sized labels
  (`$0200:$02FF INPUTBUF`) and attribute ranges (`$C080:$C0FF [noindex]`: no label on an indexed operand there)
    - `LDA $C08C,X` shows as `LDA LCBANK1_R+1,X`: indexed by the slot (X = $60), it's slot I/O (the Disk II
      data latch), not the language card. No soft switch label on an `,X` / `,Y` operand in $C080-$C0FF?
    - `STX STACK+-1`: `+-` when the offset is negative
    - negative offsets to an unrelated label: `KBD-1` for `$BFFF`, `KBD-6` for `$BFFA`
    - offsets in decimal and in hex side by side: `MSLOT-20` (= `$07E4`), `INPUTBUF+$0C`, `line72+5`
    - a rule: `label+offset` only for an offset >= 0 and inside the symbol's size (when known), always in hex

### 2026-04-01

- **DONE** need a cmd to desactivate a BP: `BD` / `BE [type] <address|range> | all`
- **DONE** need to be triggered once; hence the need to desactivate a BP: `ON <type> <address> once do "..."`
- **DONE** same apply for a HOOK (ON) -> OFF ?: `OFF <type> <address>` turns it off, `ON <type> <address>` back on
- **DONE** ON PC = $300 do nop: unquoted, `do` takes one command, up to `;` or `|>`; several commands go quoted, or in a routine (`do &routine`)

### 2026-03-31

- **DONE** REFACTO: registers in useMachine.... updated at everyframe in App.... Not sure it's the best way to do it:
  the frame loop lives in useMachine (`onUiFrame` for per-frame callbacks), synced every frame when paused and
  every 100 ms when running; code reads `vm.getRegisters()`, the reactive copy is for the views only

### 2026-03-23

- **FIXED** command `d` has a problem with range and data (pc is not updated ?); like `d $6300:$63ff` with `6300: .db <256>`:
  the range resumed at `addr + <count of displayed bytes>`, shortened to `...` for data blocks (and long hypercalls),
  so it went on 1 byte after the `.db` and decoded the data as code. Lines now carry their `size`

### 2026

- **DONE** "Run Until" Feature
  Enhance the run command (or create a new runUntil) to accept a target address. The VM would run and automatically pause when PC hits that address (effectively a temporary breakpoint).
  `run [<address>] until <target> [through]` (MCP: `run_until({ address, breakpoints: "honour" | "through" })`):
    - honour (default): the other breakpoints stop it on the way; the target stays armed, `run` goes on to it
    - through: they don't stop it, their hooks still run; until it stops for something else (pause, BRK...)
    - also: resuming from a read / write breakpoint runs the instruction (it stopped on the same access again)
- **DONE** step over / step out stop on a breakpoint inside the routine (they honour them, as run until does by default).
  A `through` for them too?
  Alt+F10 / Alt+Shift+F11 (Alt+click on the buttons), `step over|out [through]`, MCP `step({ mode, breakpoints })`:
    - honour: the step stays armed when a breakpoint stops it (step out too, now): `run` goes on to its end
    - through: the worker flags its breakpoint stops `stepThrough`, the main thread resumes after the hook
    - also: resuming from a PC breakpoint runs its instruction instead of stepping it (a step out ending on that RTS
      still stops); step out started on a breakpoint doesn't stop there at once
- **DONE** `set pc $300` fails: `params[0].match is not a function`

# History

- **FIXED** labels in routine; not working; the command is executed ! I reckon multilines are not working in routine

- **DONE** add a command to create a note -> comment
- **DONE** add a color setting for the line where the PC is for DisasmView

- **FIXED** command `buf` has a problem with the "rest"
- **FIXED** command `explain` doesn't work with pipe; like `buf flush dsprite |> explain --detailed`

-2- **DONE** -> scopepath
in disasm, the scope is from the location of the running code and it's not the same as the operand address.
for instance:
FCD2: STA $C006

FCD2 is rom
C006 is io

that means calling getLabelFromAddress returns nothing.
if an address has more than one scope, which one to use ?
do we prefix the addresses with the scope ? or in the comment, maybe ?

DONE.... ?

we need to have the ns inside the symbol so we can display it in the disasm

from
$00:FCDA 20 ED FD JSR COUT ; [rom] $FDED
to
$00:FCDA 20 ED FD JSR SYSTEM::COUT ; [rom] $FDED

-3- **DONE**
let's have a tiny assembler

-6- **DONE** - mini monitor
Memory Inspection Command
Idea: Add a command (e.g., mem or dump) to print a hex dump of a specific memory range to the output, useful for quick debugging without switching UI tabs.

-7- **DONE**
UNDEF addr
we need also UNDEF label

-8- **DONE**
we need to group the commands by theme for the HELP

-9- **DONE**
Scripts -> Routines - DONE
Add a script manager and a script editor like the note one
Script doesn’t have address but a name
; NO

> exec <url> | <name>
> ; YES
> do <name>
> Add a cmd to exec a script - DONE

-10- **DONE**
Add a cmd to add a list of labels; problem is CR is the end of the command
SOLVED: multilines commands

-11- **DONE**
Add script to execute to the machine config - DONE

-12-
Hooks - **DONE**
Like the one we had on v1
Set a hook at address and exec a command

> hook $3000 a=$10;x=$00
> Allow more than one command on a line; they should be separated by ; - DONE

-13- **DONE**
_logs_ -
A way to have small dedicated panels/windows for log.
One for hypercalls
One for a hook, for instance

A command to create such panel
To show it
To hide it

Commands to print to it

> log idx/name/id expr

-15- **NO** - IN DB INSTEAD, bps per disk (local, not global)

- Add cmd to clear BPs: bp clear - NO
- Add it to the script so choosing a machine clean up the bps- NO

File could be an URL -> for script or ROM data
Expr comma separated sub cmds
Registers
Address/label as byte/word/string

-16- **DONE** - minimonitor
Add a command to set memory values

<address> : <values>
Values comma separated 
Byte word or string
^^
Syntax problem with range
To fill mem with values
<range> : value(s)

What about conditional ?
IF expr THEN script/command
Take inspiration from shell ?

-16- **DONE**
fix minimmonitor; it needs to reparse the input string

-17- **DONE**
fix the bug : the MemView displays all zero at init.

-20- **DONE**
let's edit the BP address inline - so we can remove the "form"
we need to be able to edit the BP type inline

-21- **DONE**
let's add some function, like .hex(pc,4)... or something different like $pc
$a .... nope....
what about pc$ ... or pc.hex pc.lo pc.hi ?

-22- **DONE**
let's add some "virtual" registers to the machine; for the Apple 2e, $c019, BANKSEL

-26- **DONE**
check if multiline command work with pipe
print "print 65 \n end" |> routine test

-29- **FIXED**
init routine -> define a routine with pipe |> is not working

-30- **FIXED**
do routine |> write "txt" is not working....
we need to add to the end of the queue the pipe....

-32- **FIXED**
when the console window is snapped to the bottom and the app is started with a smaller browser window
the position of the window is not adjusted to the new bottom, i.e: it could be offscreen
