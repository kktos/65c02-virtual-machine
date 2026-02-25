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
