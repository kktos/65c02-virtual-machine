type BreakpointType = "PC" | "Write" | "Read" | "Access";

export interface Breakpoint {
	address: number;
	type: BreakpointType;
}
