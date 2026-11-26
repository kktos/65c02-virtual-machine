# TODO

### 2026-11-17

- //e devices as virtual slots: a SELECT register at `$C0B4` (the device number = its IMU ID, 8–15) and an 11-register
  window at `$C0B5`–`$C0BF`, instead of a fixed I/O range per device. The selection across interrupts (manual save /
  restore, or automatic on a vectored IRQ / its RTI) to decide. See DEVICES.md

### 2026-11-15

- memory viewer, jump history: Back / Forward (and the history list) change the index but the view doesn't move:
  `MemoryViewer.vue` doesn't watch `historyNavigationEvent` of its history (`"memory"`), and doesn't `trackLocation`,
  so a jump records its target only. To decide: the split panes share that one history, which one follows Back /
  Forward (the focused one? one history per pane?)

- disk editor, later: write to DOS 3.3 disks; copy a whole directory, make one, delete / rename a file; the
  MCP tools for it (`create_disk`, `copy_files`)
- disk editor, a disk in the drive copied to: the machine sees it once inserted again (the panel offers it)

- disk editor, viewers to add: PETSCII text, CBM BASIC listing, Applesoft listing; a default viewer by file type
  (a PRG at $0401, an `A` file)
- disk editor, disassembler viewer: always a 65C02 (`DiskDisasmView.vue`, "65C02 disassembly"), where the PET has an
  NMOS 6502. The CPU should come from the machine: a `cpu` in `MachineConfig` (there's none today), or a parameter
  of the viewer in the machine's `disk.viewers`

Noticed while running `mock mini prodos T.dsk` (asimov `images/sound/`, a Mockingboard sample player: silent):

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

- text renderers: keep only "Bitmap" (6-7x faster, same pixels)? "Font" would then only matter to check the atlas

### 2026-11-13

Noticed while chasing the speaker's sound (Conan late, Karateka silent):

- speaker, later: slow down to 1 MHz on a speaker access, as the ZipChip / TransWarp do, so the sound keeps its
  pitch at any speed?
- stack view: a setting to show / hide the bank (`$00:01F5` vs `$01F5`). Shown, the stack column needs ~18.5rem
  (`App.vue`'s grid) to fit a JSR row

### 2026-11-09

- disk editor, later: edit bytes and save the image

### 2026-11-08

Noticed while porting Karateka to a .po (its loader disassembled in the debugger):

- disassembler: opcode `$02` shows as `COP` (65816) on the 65C02, where it's a 2-byte NOP
- no Disk II card: an original disk (custom RWTS reading `$C08C,X` in slot 6) can't boot, only a block
  device. A Disk II in slot 6 (.dsk / .do / .po, then .nib / .woz for nibble-level protections) would run them
  as they are, and let their loaders be traced instead of read

- the BPs should be saved for an image/machine and reset when a new machine/image is selected

### 2026-04-01

- let's have a BP on ACCESS HIRES that triggers Game Scan to identify the game that's running
- ON ACCESS $C057 do "&identifyGame |> &applyPatch; run"

### 2026-03-31

- REFACTO: I don't like the handleJsrOutput in useCommands where it's a mini monitor thing

### 2026

- **NOT_YET**
  Can we add a feature to highlight bytes that have changed since the last update in the Memory Viewer?
- do we store the mods into a patch list... associated with the disk... patch manager ?
- ⁠Add a command to set ROM/Memory data
  ⁠Add a command to load a file into mem (already there in MemView: composable)
- add some other options for disasm (like with or without comments) that we can set with the command
- Add the worker to the Bus constructor to know whether it's in the main thread or not.
  Or refactor the whole thing to have 2 different Buses

- There are onXX in the VirtualMachine; replace them with a proper event messaging
- Shared Memory - Shared State
  We need something generic of X bytes; with a manager; instead of hardcoded values
- Fix the errors in the console
  (The `Worker: Not initialized` one is fixed: 2026-11-15 in CHANGELOG.md.)

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

-18- **WIP**
define the .DB for the system; if useful, let's have a DATADEFS like LABELS to add many in one shot

-33-
when the memory viewer tab is showing and the CPU stops (breakpoint, BRK, `BRK $8x` hypercall, step out...),
the disassembly stays hidden: both are tabs of the same panel (`activeTab` in `useDebuggerNav.ts`) and nothing
switches back to the disassembly on a stop.
Fix: `setActiveTab("disassembly")` when the CPU stops. To decide: also on a plain user pause, or only on stops
the user did not ask for (breakpoint, BRK, hypercall)?
