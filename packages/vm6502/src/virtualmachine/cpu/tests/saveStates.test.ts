import { beforeEach, describe, expect, it } from "vitest";
import type { IBus } from "@/types/bus.interface";
import {
	deleteMachineStates,
	hasMachineState,
	listMachineStates,
	type MachineViews,
	restoreMachineState,
	SAVE_STATES_MAX,
	saveMachineState,
} from "../saveStates";
import { REG_PC_OFFSET } from "../shared-memory";

const buffer = new ArrayBuffer(512 + 0x100);
const registers = new DataView(buffer, 0, 512);
const memory = new Uint8Array(buffer, 512, 0x100);
const stackMetadata = new Uint8Array(buffer, 256, 256);
let busState = { switch: false };
const bus = {
	totalCycles: 1234,
	snapshot: () => ({ ...busState }),
	restoreSnapshot: (s: unknown) => (busState = { ...(s as typeof busState) }),
} as unknown as IBus;
const views: MachineViews = { registers, stackMetadata, memory, bus };

describe("save state store", () => {
	beforeEach(() => {
		deleteMachineStates();
		new Uint8Array(buffer).fill(0);
		busState = { switch: false };
	});

	it("saves and restores the CPU registers, stack metadata, memory and bus", () => {
		registers.setUint16(REG_PC_OFFSET, 0x0300, true);
		registers.setUint8(0, 0x42);
		memory[0x10] = 7;
		stackMetadata[3] = 9;
		busState.switch = true;
		expect(saveMachineState("s", views, { disk: "x" })).toMatchObject({
			name: "s",
			pc: 0x300,
			cycles: 1234,
			bytes: REG_PC_OFFSET + 2 + 256 + 0x100,
			meta: { disk: "x" },
		});

		registers.setUint16(REG_PC_OFFSET, 0x1234, true);
		registers.setUint8(0, 0);
		registers.setUint8(40, 0x77); // not a CPU register (inputs): left alone
		memory.fill(0xff);
		stackMetadata.fill(1);
		busState.switch = false;

		expect(restoreMachineState("s", views)?.name).toBe("s");
		expect(registers.getUint16(REG_PC_OFFSET, true)).toBe(0x300);
		expect(registers.getUint8(0)).toBe(0x42);
		expect(registers.getUint8(40)).toBe(0x77);
		expect(memory[0x10]).toBe(7);
		expect(memory[0x11]).toBe(0);
		expect(stackMetadata[3]).toBe(9);
		expect(busState.switch).toBe(true);
	});

	it("unknown names: restore answers undefined, delete nothing", () => {
		expect(restoreMachineState("nope", views)).toBeUndefined();
		expect(hasMachineState("nope")).toBe(false);
		expect(deleteMachineStates("nope")).toEqual([]);
	});

	it("lists oldest first, a replaced state moving to the end; deletes one or all", () => {
		saveMachineState("a", views);
		saveMachineState("b", views);
		saveMachineState("a", views);
		expect(listMachineStates().map((s) => s.name)).toEqual(["b", "a"]);
		expect(deleteMachineStates("b")).toEqual(["b"]);
		saveMachineState("c", views);
		expect(deleteMachineStates()).toEqual(["a", "c"]);
		expect(listMachineStates()).toEqual([]);
	});

	it(`keeps at most ${SAVE_STATES_MAX}, but a full store can still replace`, () => {
		for (let i = 0; i < SAVE_STATES_MAX; i++) saveMachineState(`s${i}`, views);
		expect(() => saveMachineState("one more", views)).toThrow(/at most/);
		expect(() => saveMachineState("s0", views)).not.toThrow();
	});
});
