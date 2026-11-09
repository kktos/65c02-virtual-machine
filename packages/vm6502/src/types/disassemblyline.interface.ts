import type { AddressingMode } from "@/lib/opcodes";

type CommentKind = "inline" | "block";

export interface DisassemblyComment {
	kind: CommentKind;
	text: string;
}

export type DisassemblyLineKeys = keyof DisassemblyLine;

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
	/** display only: may be shortened ("...") for data blocks and long hypercalls */
	bytes: string;
	/** number of bytes the line covers: the next line starts at addr + size */
	size: number;

	info: string;
	comment: string;
	blockComment: string;
}
