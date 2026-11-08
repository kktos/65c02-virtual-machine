// Boots the real //e (ROMs + AppleBus, no video) in Node.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseHexData } from "@/lib/array.utils";
import { initCPU, setRunning, stepInstruction } from "@/virtualmachine/cpu/cpu.65c02";
import { MEMORY_OFFSET, REG_PC_OFFSET, STACK_METADATA_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";

type Machine = { bus: AppleBus; regs: DataView; messages: { type: string }[] };

const boot = (): Machine => {
	const messages: { type: string }[] = [];
	vi.stubGlobal("self", { postMessage: (m: { type: string }) => messages.push(m) });
	vi.stubGlobal("performance", { now: () => 0 });

	const size = apple2e.memory.size;
	const buffer = new SharedArrayBuffer(MEMORY_OFFSET + size);
	const regs = new DataView(buffer, 0, MEMORY_OFFSET);
	const mem = new Uint8Array(buffer, MEMORY_OFFSET, size);
	const bus = new AppleBus(mem);
	bus.setRegistersView(regs);
	for (const c of apple2e.memory.chunks ?? [])
		bus.load(c.addr, typeof c.data === "string" ? parseHexData(c.data) : (c.data as Uint8Array), c.bank, c.tag);
	initCPU(bus, regs, null, mem, new Uint8Array(buffer, STACK_METADATA_OFFSET, 256)); // resets the CPU
	setRunning(false);
	return { bus, regs, messages };
};

const pc = (m: Machine) => m.regs.getUint16(REG_PC_OFFSET, true);

/**
 * Steps until `until` is true; fails on BRK. Checked before each step: stepping executes a BRK
 * (through $FFFE) rather than stopping on it, so the CPU doesn't report it.
 */
const runUntil = (m: Machine, until: () => boolean, maxSteps = 3_000_000) => {
	for (let i = 0; i < maxSteps; i++) {
		if (until()) return;
		if (m.bus.readDebug(pc(m)) === 0x00) throw new Error(`BRK at $${pc(m).toString(16).toUpperCase()}`);
		stepInstruction();
		m.messages.length = 0;
	}
	throw new Error(`not reached after ${maxSteps} instructions (PC=$${pc(m).toString(16).toUpperCase()})`);
};

// What the MCP screen_text tool returns.
const textLine = (m: Machine, row: number) => m.bus.getTextScreen()[row]?.trim();

const KEYIN_LOOP = 0xc28b; // //e enhanced KEYIN: LDA $C000 / BPL, waiting for a key

describe("//e boot with no disk in the SmartPort drive (slot 5)", () => {
	let m: Machine;
	beforeEach(() => {
		m = boot();
	});

	it("resumes the slot scan when the boot fails and ends at the BASIC prompt", () => {
		// Banner on row 0, `]` prompt on row 2, then BASIC waits for a key.
		runUntil(m, () => pc(m) === KEYIN_LOOP && textLine(m, 2) === "]");
		expect(textLine(m, 0)).toBe("Apple //e");
	});

	it("cold-starts BASIC when the boot code is called directly (C500G / PR#5)", () => {
		m.bus.write(0x00, 0x00);
		m.bus.write(0x01, 0x00); // not called by the slot scan
		m.regs.setUint16(REG_PC_OFFSET, 0xc500, true);
		runUntil(m, () => pc(m) === 0xe000, 10_000);
	});
});

it("runUntil fails on a BRK (the check the tests above rely on)", () => {
	const m = boot();
	m.bus.write(0x300, 0xea); // NOP
	m.bus.write(0x301, 0x00); // BRK
	m.regs.setUint16(REG_PC_OFFSET, 0x300, true);
	expect(() => runUntil(m, () => false, 10)).toThrow("BRK at $301");
});
