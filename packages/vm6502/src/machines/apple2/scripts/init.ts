import { labels_graphics } from "./labels.graphics";
import { labels_system } from "./labels.system";

export const initRoutine = `
;
; Apple 2e init script
; run once on machine load; useless afterwards
; visible here for reference
;

	; clear console
	cls

	; load Apple 2e system symbols
	routine define_labels
		${labels_system}
		${labels_graphics}
	end

	; routine whileBody
	; 	print "$"+hex($2000 + int(a/64)*$28 + int(a%8)*$400 + ((a/8)&7)*$80), "line"+a  |> buf push temp
	; 	a=a+1
	; end
	; routine graphics
	; 	regs save
	; 	a=0
	; 	while a<191 do &whileBody |> nop
	; 	reg restore
	; end
	; do graphics

	; define a string at $FF0A where the machine name is stored
	; Apple //e
	da $FF0A 9

	; labels are search first in x, then y, etc
	SCOPEPATH "main" "io" "rom"

	; define a virtual register for BANKSEL ($C073)
	vr BR BANKSEL byte rw

	; set console font to Apple //e 40cols font ;)
	font "PRINTCHAR21"

	printmd "|  **Apple //e**  |<br>|:-----------:|"

	;printmd "![alt text](https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png 'Logo Title Text 1')"

	; routine to dump hex bytes without addresses
	routine hd @from @to
	  hd @from @to |> tr text |> sed //.+?:\\s*((?:[0-9A-F]{2} )+)\\s+.+// "$1"
	end

	; routine uses by xref, for instance, to goto to addr on click on the link
	routine disasm_at @addr @wantMem
		IF @wantMem==0 dv @addr |> nop
		IF @wantMem m1 @addr |> nop
	end

routine drawChar @char @xPos @yPos
	if @char==32 then return
	pc= $b49d + (@char - 65) * 8
	mem[$2000 + val("line"+(@yPos+6)) + @xPos]= mem[pc+0]
	mem[$2000 + val("line"+(@yPos+5)) + @xPos]= mem[pc+1]
	mem[$2000 + val("line"+(@yPos+4)) + @xPos]= mem[pc+2]
	mem[$2000 + val("line"+(@yPos+3)) + @xPos]= mem[pc+3]
	mem[$2000 + val("line"+(@yPos+2)) + @xPos]= mem[pc+5]
	mem[$2000 + val("line"+(@yPos+1)) + @xPos]= mem[pc+6]
	mem[$2000 + val("line"+(@yPos+0)) + @xPos]= mem[pc+7]
	refresh
end

routine drawString @text @xPos @yPos
	regs save
	a=$ff
	while inc(a)<len(@text) do &drawChar asc(substr(@text,a)) @xPos+a @yPos |> nop
	reg restore
end

`;
