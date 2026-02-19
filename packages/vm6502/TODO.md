
-1-
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
	$00:FCDA	20 ED FD 	JSR COUT				; [rom] $FDED
to
	$00:FCDA	20 ED FD 	JSR SYSTEM::COUT		; [rom] $FDED

-3-
let's have a tiny assembler

-4-
do we store the mods into a patch list... associated with the disk... patch manager ?

