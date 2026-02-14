/** biome-ignore-all lint/suspicious/noAssignInExpressions: <compactness> */
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

// Map<physicalAddress, flags>
export const bankedBreakpoints = new Map<number, number>();

export let stepBPAddress: number | null = null;
export let stepAddedBreakpoint = false;
export let breakOnBrk = false;

export const setStepBPAddress = (address: number | null) => (stepBPAddress = address);
export const setStepAddedBreakpoint = (added: boolean) => (stepAddedBreakpoint = added);
export const setBreakOnBrk = (enabled: boolean) => (breakOnBrk = enabled);

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
		// i is a physical address here
		const logicalAddr = i & 0xffff;
		// biome-ignore lint/style/noNonNullAssertion: <expected>
		breakpointMap[logicalAddr]! |= flag;
		const oldFlags = bankedBreakpoints.get(i) ?? 0;
		bankedBreakpoints.set(i, oldFlags | flag);
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
		// i is a physical address here
		const oldFlags = bankedBreakpoints.get(i) ?? 0;
		const newFlags = oldFlags & mask;

		if (newFlags === 0) bankedBreakpoints.delete(i);
		else bankedBreakpoints.set(i, newFlags);

		// Recalculate the fast-check map entry
		const logicalAddr = i & 0xffff;
		let remainingFlags = 0;
		for (const [pAddr, pFlags] of bankedBreakpoints.entries()) {
			if ((pAddr & 0xffff) === logicalAddr) remainingFlags |= pFlags;
		}
		breakpointMap[logicalAddr] = remainingFlags;
	}
}

export function clearBreakpoints() {
	breakpointMap.fill(0);
	bankedBreakpoints.clear();
}

export function cleanStepBP() {
	if (stepAddedBreakpoint && stepBPAddress !== null) removeBreakpoint("pc", stepBPAddress);
	setStepBPAddress(null);
	setStepAddedBreakpoint(false);
}
