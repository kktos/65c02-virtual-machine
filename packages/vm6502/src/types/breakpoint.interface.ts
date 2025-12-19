type BreakpointType = "pc" | "read" | "write" | "access";

export interface Breakpoint {
	address: number;
	type: BreakpointType;
}
