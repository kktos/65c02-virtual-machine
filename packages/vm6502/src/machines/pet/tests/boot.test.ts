// Boots the real PET 3032 (ROMs + PetBus, no video) in Node. Needs the ROMs: `npm run roms:pet`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initCPU, setIrqLine, setRunning, stepInstruction, triggerNmi } from "@/virtualmachine/cpu/cpu.65c02";
import { MEMORY_OFFSET, REG_PC_OFFSET, STACK_METADATA_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { PetBus } from "../pet.bus";
import { pet3032 } from "../pet.machine";

// Node's fs, typed here: the app's tsconfig (which checks the tests too) has no Node types.
const fs: { existsSync(path: URL): boolean; readFileSync(path: URL): Uint8Array } = await import(`node:${"fs"}`);
const publicDir = new URL("../../../../public/", import.meta.url);
const rom = (src: string) => new Uint8Array(fs.readFileSync(new URL(src, publicDir)));
const romsFetched = (pet3032.memory.chunks ?? []).every((c) => c.src && fs.existsSync(new URL(c.src, publicDir)));

type Machine = { bus: PetBus; regs: DataView };

const boot = (): Machine => {
	vi.stubGlobal("self", { postMessage: () => undefined });
	vi.stubGlobal("performance", { now: () => 0 });

	const size = pet3032.memory.size;
	const buffer = new SharedArrayBuffer(MEMORY_OFFSET + size);
	const regs = new DataView(buffer, 0, MEMORY_OFFSET);
	const mem = new Uint8Array(buffer, MEMORY_OFFSET, size);
	const bus = new PetBus(mem);
	bus.setRegistersView(regs);
	for (const c of pet3032.memory.chunks ?? []) bus.load(c.addr, rom(c.src as string));
	initCPU(bus, regs, null, mem, new Uint8Array(buffer, STACK_METADATA_OFFSET, 256)); // resets the CPU
	setIrqLine(false);
	bus.setInterruptLines({ irq: setIrqLine, nmi: triggerNmi });
	setRunning(false);
	return { bus, regs };
};

const pc = (m: Machine) => m.regs.getUint16(REG_PC_OFFSET, true);
const screen = (m: Machine) => m.bus.getTextScreen().map((line) => line.trimEnd());

const runUntil = (m: Machine, until: () => boolean, maxSteps = 5_000_000) => {
	for (let i = 0; i < maxSteps; i++) {
		if (until()) return;
		stepInstruction();
	}
	throw new Error(
		`not reached after ${maxSteps} instructions (PC=$${pc(m).toString(16).toUpperCase()})\n${screen(m).join("\n")}`,
	);
};

describe.skipIf(!romsFetched)("PET 3032 boot (BASIC 2)", () => {
	let m: Machine;
	beforeEach(() => {
		m = boot();
	});

	it("shows the banner, the free memory and READY.", () => {
		runUntil(m, () => screen(m).includes("READY."));
		expect(screen(m)[0]).toBe("### COMMODORE BASIC ###"); // BASIC 2's (BASIC 1: ***)
		expect(screen(m)[2]).toBe(" 31743 BYTES FREE");
	});

	it("runs a typed command (the keyboard matrix, scanned by the 60 Hz IRQ)", () => {
		runUntil(m, () => screen(m).includes("READY."));
		expect(m.bus.typeText("print 6*7\n")).toEqual({ queued: 10, skipped: 0 });
		runUntil(m, () => screen(m).includes(" 42"));
		expect(screen(m)).toContain("PRINT 6*7");
		runUntil(m, () => screen(m).filter((line) => line === "READY.").length === 2);
	});

	it("types the same key twice in a row (a scan with the key up in between)", () => {
		runUntil(m, () => screen(m).includes("READY."));
		m.bus.typeText('?"OO"\n');
		runUntil(m, () => screen(m).includes("OO"));
	});

	it("doesn't lose real keys tapped faster than the scans (down and up at once)", () => {
		runUntil(m, () => screen(m).includes("READY."));
		for (const key of [..."?1+1", "Enter"]) {
			m.bus.pressKey(key, key);
			m.bus.releaseKey(key, key);
		}
		runUntil(m, () => screen(m).includes(" 2"));
		expect(screen(m)).toContain("?1+1");
	});

	it("switches to the lower case set (POKE 59468,14)", () => {
		runUntil(m, () => screen(m).includes("READY."));
		m.bus.typeText("poke 59468,14\n");
		runUntil(m, () => m.bus.lowercase);
		// The letters typed unshifted are lower case in this set
		runUntil(m, () => screen(m).filter((line) => line === "ready.").length === 2);
	});
});
