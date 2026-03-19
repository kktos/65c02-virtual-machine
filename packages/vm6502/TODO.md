-1- **NOT_YET**
Can we add a feature to highlight bytes that have changed since the last update in the Memory Viewer?

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

-4-
do we store the mods into a patch list... associated with the disk... patch manager ?

-5-
"Run Until" Feature
Enhance the run command (or create a new runUntil) to accept a target address. The VM would run and automatically pause when PC hits that address (effectively a temporary breakpoint).

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

-14-
⁠Add a command to set ROM/Memory data
⁠Add a command to load a file into mem (already there in MemView: composable)

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

-18-
define the .DB for the system; if useful, let's have a DATADEFS like LABELS to add many in one shot

-19-
add some other options for disasm (like with or without comments) that we can set with the command

-20- **DONE**
let's edit the BP address inline - so we can remove the "form"
we need to be able to edit the BP type inline

-21- **DONE**
let's add some function, like .hex(pc,4)... or something different like $pc
$a .... nope....
what about pc$ ... or pc.hex pc.lo pc.hi ?

-22- **DONE**
let's add some "virtual" registers to the machine; for the Apple 2e, $c019, BANKSEL

-23-
Add the worker to the Bus constructor to know whether it's in the main thread or not.
Or refactor the whole thing to have 2 different Buses

-24-
There are onXX in the VirtualMachine; replace them with a proper event messaging

-25-
Shared Memory - Shared State
We need something generic of X bytes; with a manager; instead of hardcoded values

-26- **WIP** ASM OK.
check if multiline command work with pipe
print "print 65 \n end" |> routine test
