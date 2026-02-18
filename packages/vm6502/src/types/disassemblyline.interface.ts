import type { AddressingMode } from "@/lib/opcodes";

export interface DisassemblyLine {
	label: string;
	src: string;
	addr: number;
	faddr: string;
	mode: AddressingMode;
	opc: string;
	opr: string;
	oprn: number;
	cycles: number;
	bytes: string;
	comment: string;
}
