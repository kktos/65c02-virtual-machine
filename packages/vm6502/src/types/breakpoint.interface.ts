type BreakpointType = "pc" | "read" | "write" | "access";

export interface Breakpoint {
	address: number;
	endAddress?: number;
	type: BreakpointType;
	enabled?: boolean;
}
