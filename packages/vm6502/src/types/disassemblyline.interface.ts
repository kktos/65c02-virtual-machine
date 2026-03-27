import type { AddressingMode } from "@/lib/opcodes";

type CommentKind = "inline" | "block";

export interface DisassemblyComment {
	kind: CommentKind;
	text: string;
	source: "user" | "debugger";
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
	bytes: string;

	comments: DisassemblyComment[];

	info: string;
	comment: string;
	blockComment: string;
}
