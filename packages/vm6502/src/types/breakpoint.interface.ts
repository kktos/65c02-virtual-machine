type BreakpointType = "pc" | "read" | "write" | "access";

export interface Breakpoint {
	address: number;
	endAddress?: number;
	type: BreakpointType;
	enabled?: boolean;
	command?: string;
	isTemporary?: boolean;
	/** Turned off (not removed) on its first hit: `ON <type> <address> once do ...` */
	once?: boolean;
}
