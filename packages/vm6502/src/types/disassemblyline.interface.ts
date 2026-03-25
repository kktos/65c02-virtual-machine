import type { AddressingMode } from "@/lib/opcodes";

type CommentKind = "inline" | "block";

export interface DisassemblyComment {
	kind: CommentKind;
	text: string;
	source: "user" | "debugger";
}

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
}
