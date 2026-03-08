-1- **NOT_YET**
Can we add a feature to highlight bytes that have changed since the last update in the Memory Viewer?

-2-
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

-6-
Memory Inspection Command
Idea: Add a command (e.g., mem or dump) to print a hex dump of a specific memory range to the output, useful for quick debugging without switching UI tabs.

-7-
UNDEF addr
we need also UNDEF label

-8-
we need to group the commands by theme for the HELP

-9-
Scripts -> Routines
Add a script manager and a script editor like the note one
Script doesn’t have address but a name

; NO

> exec <url> | <name>

; YES

> do <name>

Add a cmd to exec a script - DONE

-10- DONE
Add a cmd to add a list of labels; problem is CR is the end of the command
SOLVED: multilines commands

-11-
Add script to execute to the machine config - DONE

-12-
Hooks - DONE
Like the one we had on v1
Set a hook at address and exec a command

> hook $3000 a=$10;x=$00

Allow more than one command on a line; they should be separated by ; - DONE

-13-
_logs_ - DONE
A way to have small dedicated panels/windows for log.
One for hypercalls
One for a hook, for instance

A command to create such panel
To show it
To hide it

Commands to print to it

> log idx/name/id expr

-14-

- Add cmd to clear BPs: bp clear
- Add it to the script so choosing a machine clean up the bps
- ⁠Add a command to set ROM/Memory data
- ⁠Add a command to load a file into mem (already there in MemView: composable)

File could be an URL -> for script or ROM data

Expr comma separated sub cmds

Registers
Address/label as byte/word/string

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
