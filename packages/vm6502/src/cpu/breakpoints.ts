import type { Breakpoint } from "@/types/breakpoint.interface";

export class BreakpointError extends Error {
	public type: "read" | "write";
	public address: number;

	constructor(type: "read" | "write", address: number) {
		super();
		this.type = type;
		this.address = address;
	}
}

// --- Breakpoint State ---
export const pcBreakpoints = new Set<number>();
export const memoryReadBreakpoints = new Set<number>();
export const memoryWriteBreakpoints = new Set<number>();
export const memoryAccessBreakpoints = new Set<number>();

export let stepBPAddress: number | null = null;
export let stepAddedBreakpoint = false;
export let breakOnBrk = false;

export function setStepBPAddress(address: number | null) {
	stepBPAddress = address;
}

export function setStepAddedBreakpoint(added: boolean) {
	stepAddedBreakpoint = added;
}

export function setBreakOnBrk(enabled: boolean) {
	breakOnBrk = enabled;
}

export function addBreakpoint(type: Breakpoint["type"], address: number) {
	switch (type) {
		case "pc":
			pcBreakpoints.add(address);
			break;
		case "read":
			memoryReadBreakpoints.add(address);
			break;
		case "write":
			memoryWriteBreakpoints.add(address);
			break;
		case "access":
			memoryAccessBreakpoints.add(address);
			break;
	}
}

export function removeBreakpoint(type: Breakpoint["type"], address: number) {
	switch (type) {
		case "pc":
			pcBreakpoints.delete(address);
			break;
		case "read":
			memoryReadBreakpoints.delete(address);
			break;
		case "write":
			memoryWriteBreakpoints.delete(address);
			break;
		case "access":
			memoryAccessBreakpoints.delete(address);
			break;
	}
}

export function clearBreakpoints() {
	pcBreakpoints.clear();
	memoryReadBreakpoints.clear();
	memoryWriteBreakpoints.clear();
	memoryAccessBreakpoints.clear();
}

export function cleanStepBP() {
	if (stepAddedBreakpoint && stepBPAddress !== null) pcBreakpoints.delete(stepBPAddress);
	stepBPAddress = null;
	stepAddedBreakpoint = false;
}
