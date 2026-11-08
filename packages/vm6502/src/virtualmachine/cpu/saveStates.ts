// Save states, kept in the worker: the whole machine at one point, to go back to it (restore → patch → compare).
// A state is the CPU registers, the debugger's stack metadata, all of memory (the shared buffer's memory section:
// RAM, language card, ROMs) and what the bus keeps outside memory (`IBus.snapshot`: soft switches, cards…).
// Saved / restored between two time slices of the run loop, so a running machine is caught between instructions.

import type { IBus } from "@/types/bus.interface";
import { REG_PC_OFFSET } from "./shared-memory";

export const SAVE_STATES_MAX = 32;
/** A, X, Y, SP, P, (unused), PC: the CPU registers at the start of the shared registers. */
const CPU_REGISTERS_SIZE = REG_PC_OFFSET + 2;

/** What the main thread passes along when saving (e.g. the disk in the drive), given back as is. */
export type SaveStateMeta = Record<string, unknown>;

type SaveState = {
	registers: Uint8Array;
	stackMetadata: Uint8Array;
	memory: Uint8Array;
	bus: unknown;
	pc: number;
	cycles: number | undefined;
	createdAt: number;
	meta: SaveStateMeta;
};

/** A save state as listed: no data. */
export type SaveStateInfo = {
	name: string;
	pc: number;
	cycles?: number;
	createdAt: number;
	bytes: number;
	meta: SaveStateMeta;
};

export type MachineViews = {
	registers: DataView;
	stackMetadata: Uint8Array;
	memory: Uint8Array;
	bus: IBus | null;
};

const states = new Map<string, SaveState>();

const totalCycles = (bus: IBus | null) => {
	const cycles = (bus as { totalCycles?: unknown } | null)?.totalCycles;
	return typeof cycles === "number" ? cycles : undefined;
};

const info = (name: string, s: SaveState): SaveStateInfo => ({
	name,
	pc: s.pc,
	...(s.cycles !== undefined && { cycles: s.cycles }),
	createdAt: s.createdAt,
	bytes: s.registers.length + s.stackMetadata.length + s.memory.length,
	meta: s.meta,
});

/** Saves under `name` (replacing a state with that name). Throws when the store is full. */
export function saveMachineState(name: string, views: MachineViews, meta: SaveStateMeta = {}): SaveStateInfo {
	if (!states.has(name) && states.size >= SAVE_STATES_MAX)
		throw new Error(`at most ${SAVE_STATES_MAX} save states: delete some first`);
	const registers = new Uint8Array(views.registers.buffer, views.registers.byteOffset, CPU_REGISTERS_SIZE);
	const state: SaveState = {
		registers: registers.slice(),
		stackMetadata: views.stackMetadata.slice(),
		memory: views.memory.slice(),
		bus: views.bus?.snapshot?.(),
		pc: views.registers.getUint16(REG_PC_OFFSET, true),
		cycles: totalCycles(views.bus),
		createdAt: Date.now(),
		meta,
	};
	states.delete(name); // a replaced state goes to the end of the list
	states.set(name, state);
	return info(name, state);
}

/** Puts the machine back as saved. Returns undefined when there is no state `name`. */
export function restoreMachineState(name: string, views: MachineViews): SaveStateInfo | undefined {
	const state = states.get(name);
	if (!state) return undefined;
	new Uint8Array(views.registers.buffer, views.registers.byteOffset, CPU_REGISTERS_SIZE).set(state.registers);
	views.stackMetadata.set(state.stackMetadata);
	views.memory.set(state.memory);
	if (state.bus !== undefined) views.bus?.restoreSnapshot?.(state.bus);
	return info(name, state);
}

export const hasMachineState = (name: string) => states.has(name);

/** Oldest first. */
export const listMachineStates = (): SaveStateInfo[] => Array.from(states, ([name, s]) => info(name, s));

/** Deletes `name`, or all of them without a name. Returns the names deleted. */
export function deleteMachineStates(name?: string): string[] {
	if (name === undefined) {
		const names = [...states.keys()];
		states.clear();
		return names;
	}
	return states.delete(name) ? [name] : [];
}
