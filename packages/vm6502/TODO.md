# TODO

### 2026-11-15

- **FIXED** disassembly, jump history: after a Ctrl+click on a label, Back was sometimes disabled though the previous
  address was in the history (Back to A, then Ctrl+click from A: A matched the last entry, the index stayed at 0)
  - `useAddressHistory.ts`: `historyIndex` is the current entry (-1: empty), was one past the end; an address is
    skipped only when it is the current entry, the forward entries are dropped before it is added
  - a jump records where the view was, then where it goes (`trackLocation` / `recordJump`): Back from the first
    jump returns to its origin. Ctrl+click, the goto box, xref / procedure panels, the stack view, `disasmView`
  - `ProcContextFloatPanel.vue`: a leftover `jumpToAddress(0x2000)` (and `console.log`) before each jump, removed
- **DONE** disassembly, Ctrl+click follows on mousedown (on macOS Ctrl+click is a right-click, no `click`); Ctrl+hover
  underlines what it follows; `JMP (abs)` / `JMP (abs,X)` follow the pointer; ZP / `(zp)` operands open the memory view
- memory viewer, jump history: Back / Forward (and the history list) change the index but the view doesn't move:
  `MemoryViewer.vue` doesn't watch `historyNavigationEvent` of its history (`"memory"`), and doesn't `trackLocation`,
  so a jump records its target only. To decide: the split panes share that one history, which one follows Back /
  Forward (the focused one? one history per pane?)

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
- disk editor, later: write to DOS 3.3 disks; copy a whole directory, make one, delete / rename a file; the
  MCP tools for it (`create_disk`, `copy_files`)
- disk editor, a disk in the drive copied to: the machine sees it once inserted again (the panel offers it)

- **DONE** disk editor, machine agnostic: it knew only Apple disks (DOS 3.3, ProDOS, 35 x 16 sectors) and showed
  every viewer, HGR on a PET too. The machine's config now names them (`disk.formats`, `disk.viewers`)
  - `lib/disk/diskFormat.type.ts`: what the editor shows of a disk (`OpenedDisk`): raw layout (tracks from 0 or 1,
    sectors per track, blocks or not), a tree of directories / files by ids, a volume map, what each sector holds
  - `lib/disk/formats/`: `apple2` (what `analyzeDisk` found, the sector order as a "reading" choice) and `cbm`
    (D64: BAM, flat directory, PRG load address, PETSCII names, decimal T/S)
  - `app/diskeditor/viewers/index.ts`: hex (always there), hgr, disasm; a viewer can ask for more than a sector (HGR: 8K)
  - the editor lists the library disks of the machine's drive only
- disk editor, viewers to add: PETSCII text, CBM BASIC listing, Applesoft listing; a default viewer by file type
  (a PRG at $0401, an `A` file)
- disk editor, disassembler viewer: always a 65C02 (`DiskDisasmView.vue`, "65C02 disassembly"), where the PET has an
  NMOS 6502. The CPU should come from the machine: a `cpu` in `MachineConfig` (there's none today), or a parameter
  of the viewer in the machine's `disk.viewers`

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
- slots, later: per-disk slots, in the disk's notes (a disk that wants the Mockingboard in 4), over the user's
  layout when the disk boots (a power cycle when they differ?)
- slots, later: the mouse in `MachineConfig.inputs` (`MouseControl`, `hasMouse`) stays when no mouse card is in a
  slot; the inputs could follow the cards
- mouse, later: `MouseControl.vue` is generic UI but now follows the Apple II mouse card's protocol (the
  CLAMPMOUSE / double-click fix): rethink it when another machine gets a mouse
  - `HOST_RANGE = 1024` is a copy of the card's `MOUSE_HOST_RANGE` (`mouse.card.ts`), kept equal by hand
  - it sends a position that wraps at 1024, as a float in the analog inputs 2 & 3, and the card turns it back into
    motion (`setHostMouse`, the shortest way across the wrap). It is really a relative device going through an
    absolute channel: a machine that wants deltas has to undo the wrap, and one that wants an absolute position
    (clamped by the host, a tablet / light pen) doesn't fit at all
  - the button inputs 4 & 5 (`apple.machine.ts`) are picked to stay clear of the //e's PB0-PB3 (digital 0-3, read
    by the bus as Open Apple / Solid Apple / Shift): input indices that collide across devices are only avoided by
    a comment in the config
  - a way out: a mouse input that sends motion (deltas, summed until the machine reads them) and the buttons, as its
    own kind of input, not analog / digital indices; each machine's device clamps or wraps as its hardware does
- slots, later: a generic ROM card ($Cn00 ROM, $C800 expansion ROM, a user file or `rom/slotN.rom.ts`)

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
- text renderers: keep only "Bitmap" (6-7x faster, same pixels)? "Font" would then only matter to check the atlas
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
- speaker, later: slow down to 1 MHz on a speaker access, as the ZipChip / TransWarp do, so the sound keeps its
  pitch at any speed?
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
- stack view: a setting to show / hide the bank (`$00:01F5` vs `$01F5`). Shown, the stack column needs ~18.5rem
  (`App.vue`'s grid) to fit a JSR row

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
- disk editor, later: edit bytes and save the image

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
- disassembler: opcode `$02` shows as `COP` (65816) on the 65C02, where it's a 2-byte NOP
- no Disk II card: an original disk (custom RWTS reading `$C08C,X` in slot 6) can't boot, only a block
  device. A Disk II in slot 6 (.dsk / .do / .po, then .nib / .woz for nibble-level protections) would run them
  as they are, and let their loaders be traced instead of read

- the BPs should be saved for an image/machine and reset when a new machine/image is selected

### 2026-04-01

- **DONE** need a cmd to desactivate a BP: `BD` / `BE [type] <address|range> | all`
- let's have a BP on ACCESS HIRES that triggers Game Scan to identify the game that's running
- **DONE** need to be triggered once; hence the need to desactivate a BP: `ON <type> <address> once do "..."`
- **DONE** same apply for a HOOK (ON) -> OFF ?: `OFF <type> <address>` turns it off, `ON <type> <address>` back on
- **DONE** ON PC = $300 do nop: unquoted, `do` takes one command, up to `;` or `|>`; several commands go quoted, or in a routine (`do &routine`)
- ON ACCESS $C057 do "&identifyGame |> &applyPatch; run"

### 2026-03-31

- **DONE** REFACTO: registers in useMachine.... updated at everyframe in App.... Not sure it's the best way to do it:
  the frame loop lives in useMachine (`onUiFrame` for per-frame callbacks), synced every frame when paused and
  every 100 ms when running; code reads `vm.getRegisters()`, the reactive copy is for the views only
- REFACTO: I don't like the handleJsrOutput in useCommands where it's a mini monitor thing

### 2026-03-23

- **FIXED** command `d` has a problem with range and data (pc is not updated ?); like `d $6300:$63ff` with `6300: .db <256>`:
  the range resumed at `addr + <count of displayed bytes>`, shortened to `...` for data blocks (and long hypercalls),
  so it went on 1 byte after the `.db` and decoded the data as code. Lines now carry their `size`

### 2026

- **NOT_YET**
  Can we add a feature to highlight bytes that have changed since the last update in the Memory Viewer?
- do we store the mods into a patch list... associated with the disk... patch manager ?
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
- ⁠Add a command to set ROM/Memory data
  ⁠Add a command to load a file into mem (already there in MemView: composable)
- add some other options for disasm (like with or without comments) that we can set with the command
- Add the worker to the Bus constructor to know whether it's in the main thread or not.
  Or refactor the whole thing to have 2 different Buses

- There are onXX in the VirtualMachine; replace them with a proper event messaging
- Shared Memory - Shared State
  We need something generic of X bytes; with a manager; instead of hardcoded values
- Fix the errors in the console

```
Worker: Not initialized. Send 'init' command with buffer first. {"command":"setDebugOverrides","category":"bus","overrides":{"slot":5,"smartPortLogging":false}}
```

```
useDataFormattings.ts:49 Uncaught (in promise) Error: No disk key provided
    at getDb (useDataFormattings.ts:49:29)
    at addFormatting (useDataFormattings.ts:184:20)
    at Object.defDataFn [as fn] (defData.cmd.ts:16:2)
    at processLine (useCommands.ts:437:37)
    at async executeCommand (useCommands.ts:521:20)
    at async loadMachine (useMachine.ts:130:4)
```

- store routines for the machine/disk
- Now that we have regex support, can we add a `=~` operator to match a string against a regex?
- add a rate limiter on LOG like "every 100" or "every100ms"
  Meaning:

```javascript
if (countBased) {
	if (++counter % N !== 0) return;
}
if (timeBased) {
	if (now - lastTime < ms) return;
	lastTime = now;
}
```

log Acc every 100th time PC == main_loop  
`hook pc main_loop log trace every 100 "A=", A`

log Acc every 100ms time $C019 is accessed  
`hook access $C019 log trace every 100ms "A=", A`

- first logs once, then disables itself  
  `log trace first "Entered IRQ"`  
  last logs on hook removal / VM stop  
  `log trace last "Leaving IRQ"`
- let's refactor cmd search to uses the new wildcards

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

-18- **WIP**
define the .DB for the system; if useful, let's have a DATADEFS like LABELS to add many in one shot

-29- **FIXED**
init routine -> define a routine with pipe |> is not working

-30- **FIXED**
do routine |> write "txt" is not working....
we need to add to the end of the queue the pipe....

-32- **FIXED**
when the console window is snapped to the bottom and the app is started with a smaller browser window
the position of the window is not adjusted to the new bottom, i.e: it could be offscreen

-33-
when the memory viewer tab is showing and the CPU stops (breakpoint, BRK, `BRK $8x` hypercall, step out...),
the disassembly stays hidden: both are tabs of the same panel (`activeTab` in `useDebuggerNav.ts`) and nothing
switches back to the disassembly on a stop.
Fix: `setActiveTab("disassembly")` when the CPU stops. To decide: also on a plain user pause, or only on stops
the user did not ask for (breakpoint, BRK, hypercall)?
