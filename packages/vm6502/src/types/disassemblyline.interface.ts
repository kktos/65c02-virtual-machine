export interface DisassemblyLine {
	address: number;
	opcode: string;
	cycles: number;
	rawBytes: string;
	comment: string;
}
