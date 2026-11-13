# TODO

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
  picture (`DiskViewerSwitch.vue`, `DiskHgrView.vue`, rendering in `lib/disk/hgrImage.ts`): color or mono; a file
  as loaded, raw sectors / blocks 8K from the one shown (Page Up / Down to align a picture)
- **DONE** HGR viewer, RLE-packed pictures (`$FE` runs, Conan's `unpack.asm`): `lib/disk/hgrRle.ts` detects the
  variant (`FE value count` / `FE count value`, by columns / by lines) and the height (183 for Conan's backgrounds);
  unpacked on its own when shorter than a screen, or set by hand. Line by line, the height isn't detected (what
  follows the picture shows below it). A picture inside a file (WELCOME.DATA's second one) isn't looked for
- **DONE** disk editor, disassembler viewer (`DiskDisasmView.vue`, `lib/disk/disasmBytes.ts`): 65C02, from the load
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
