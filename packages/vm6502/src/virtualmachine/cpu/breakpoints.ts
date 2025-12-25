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
export const BP_PC = 0x01;
export const BP_READ = 0x02;
export const BP_WRITE = 0x04;

export const breakpointMap = new Uint8Array(65536);

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

export function addBreakpoint(type: Breakpoint["type"], startAddress: number, endAddress: number = startAddress) {
	let flag = 0;
	switch (type) {
		case "pc":
			flag = BP_PC;
			break;
		case "read":
			flag = BP_READ;
			break;
		case "write":
			flag = BP_WRITE;
			break;
		case "access":
			flag = BP_READ | BP_WRITE;
			break;
	}
	for (let i = startAddress; i <= endAddress; i++) {
		breakpointMap[i] |= flag;
	}
}

export function removeBreakpoint(type: Breakpoint["type"], startAddress: number, endAddress: number = startAddress) {
	let flag = 0;
	switch (type) {
		case "pc":
			flag = BP_PC;
			break;
		case "read":
			flag = BP_READ;
			break;
		case "write":
			flag = BP_WRITE;
			break;
		case "access":
			flag = BP_READ | BP_WRITE;
			break;
	}
	const mask = ~flag;
	for (let i = startAddress; i <= endAddress; i++) {
		breakpointMap[i] &= mask;
	}
}

export function clearBreakpoints() {
	breakpointMap.fill(0);
}

export function cleanStepBP() {
	if (stepAddedBreakpoint && stepBPAddress !== null) {
		breakpointMap[stepBPAddress] &= ~BP_PC;
	}
	stepBPAddress = null;
	stepAddedBreakpoint = false;
}
