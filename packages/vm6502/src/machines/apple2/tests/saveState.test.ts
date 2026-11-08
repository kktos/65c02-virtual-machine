// Save states on the real //e (ROMs + AppleBus, no video) in Node: the worker side of save_state / restore_state.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseHexData } from "@/lib/array.utils";
import { initCPU, prepareForRestore, setRunning, stepInstruction } from "@/virtualmachine/cpu/cpu.65c02";
import {
	deleteMachineStates,
	type MachineViews,
	restoreMachineState,
	saveMachineState,
} from "@/virtualmachine/cpu/saveStates";
import {
	MACHINE_STATE_OFFSET2,
	MEMORY_OFFSET,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	STACK_METADATA_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";
import { APPLE_PAGE2_MASK } from "../memory.consts";

type Machine = { bus: AppleBus; regs: DataView; views: MachineViews };

const boot = (): Machine => {
	vi.stubGlobal("self", { postMessage: () => undefined });
	vi.stubGlobal("performance", { now: () => 0 });

	const size = apple2e.memory.size;
	const buffer = new SharedArrayBuffer(MEMORY_OFFSET + size);
	const regs = new DataView(buffer, 0, MEMORY_OFFSET);
	const mem = new Uint8Array(buffer, MEMORY_OFFSET, size);
	const stack = new Uint8Array(buffer, STACK_METADATA_OFFSET, 256);
	const bus = new AppleBus(mem);
	bus.setRegistersView(regs);
	for (const c of apple2e.memory.chunks ?? [])
		bus.load(c.addr, typeof c.data === "string" ? parseHexData(c.data) : (c.data as Uint8Array), c.bank, c.tag);
	initCPU(bus, regs, null, mem, stack);
	setRunning(false);
	return { bus, regs, views: { registers: regs, stackMetadata: stack, memory: mem, bus } };
};

const pc = (m: Machine) => m.regs.getUint16(REG_PC_OFFSET, true);
const steps = (n: number) => {
	for (let i = 0; i < n; i++) stepInstruction();
};
const KEYIN_LOOP = 0xc28b; // waiting for a key at the BASIC prompt

/** Everything a save state should bring back. */
const machineState = (m: Machine) => ({
	cpu: Array.from(new Uint8Array(m.regs.buffer, 0, REG_PC_OFFSET + 2)),
	memory: m.views.memory.slice(),
	stack: m.views.stackMetadata.slice(),
	bus: m.bus.snapshot(),
});

describe("save states on the //e", () => {
	let m: Machine;
	beforeEach(() => {
		deleteMachineStates();
		m = boot();
		for (let i = 0; i < 3_000_000 && pc(m) !== KEYIN_LOOP; i++) stepInstruction(); // to the BASIC prompt
		expect(pc(m)).toBe(KEYIN_LOOP);
	});

	it("puts registers, memory, soft switches and cards back", () => {
		const before = machineState(m);
		saveMachineState("prompt", m.views, { disk: null });

		// change everything a state covers
		m.bus.pressKey?.("A");
		steps(20_000);
		m.bus.read(0xc055); // PAGE2 on
		m.bus.insertMedia(new Uint8Array(512), { slot: 5, name: "x.po" });
		m.regs.setUint8(REG_A_OFFSET, 0x99);
		expect(machineState(m)).not.toEqual(before);

		const info = restoreMachineState("prompt", m.views);
		expect(info).toMatchObject({ name: "prompt", pc: KEYIN_LOOP, meta: { disk: null } });
		expect(machineState(m)).toEqual(before);
		expect(m.bus.page2).toBe(false);
		// the shared soft switch bytes the main thread reads are rewritten too
		expect(m.regs.getUint8(MACHINE_STATE_OFFSET2) & APPLE_PAGE2_MASK).toBe(0);
	});

	it("replays the same way from a restored state", () => {
		saveMachineState("prompt", m.views);
		const run = () => {
			m.bus.pressKey?.("P");
			steps(50_000);
			return machineState(m);
		};
		const first = run();
		restoreMachineState("prompt", m.views);
		expect(run()).toEqual(first);
	});

	it("restores again and again, and leaves states independent", () => {
		saveMachineState("a", m.views);
		m.bus.write(0x300, 0x11);
		saveMachineState("b", m.views);
		m.bus.write(0x300, 0x22);

		restoreMachineState("a", m.views);
		expect(m.bus.readDebug(0x300)).toBe(0x00);
		m.bus.write(0x300, 0x33); // changing memory doesn't change the state
		restoreMachineState("a", m.views);
		expect(m.bus.readDebug(0x300)).toBe(0x00);
		restoreMachineState("b", m.views);
		expect(m.bus.readDebug(0x300)).toBe(0x11);
	});

	it("prepareForRestore stops a running machine, reporting a pause", () => {
		const messages: unknown[] = [];
		vi.stubGlobal("self", { postMessage: (msg: unknown) => messages.push(msg) });
		vi.stubGlobal("setTimeout", () => 0); // the run loop's next slice
		vi.stubGlobal("requestAnimationFrame", () => 0);
		setRunning(true);
		messages.length = 0;
		prepareForRestore();
		expect(messages).toEqual([{ type: "isRunning", isRunning: false, stop: { reason: "pause" } }]);
		prepareForRestore(); // paused: nothing to say
		expect(messages).toHaveLength(1);
	});
});
