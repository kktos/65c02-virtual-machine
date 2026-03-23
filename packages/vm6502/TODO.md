# TODO

- **NOT_YET**
  Can we add a feature to highlight bytes that have changed since the last update in the Memory Viewer?
- do we store the mods into a patch list... associated with the disk... patch manager ?
- "Run Until" Feature
  Enhance the run command (or create a new runUntil) to accept a target address. The VM would run and automatically pause when PC hits that address (effectively a temporary breakpoint).
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
