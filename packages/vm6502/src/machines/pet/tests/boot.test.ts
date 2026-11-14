// Boots the real PET 3032 (ROMs + PetBus, no video) in Node. Needs the ROMs: `npm run roms:pet`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initCPU, resetCPU, setIrqLine, setRunning, stepInstruction, triggerNmi } from "@/virtualmachine/cpu/cpu.65c02";
import { MEMORY_OFFSET, REG_PC_OFFSET, STACK_METADATA_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { basicProgram, buildD64 } from "@/lib/tests/d64Builder";
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

/** Checks `until` every 1000 instructions (reading the screen each one is slow) */
const runUntil = (m: Machine, until: () => boolean, maxSteps = 5_000_000) => {
	for (let i = 0; i < maxSteps; i++) {
		if (i % 1000 === 0 && until()) return;
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

describe.skipIf(!romsFetched)("PET 3032 with the 4040 drive (device 8)", () => {
	// 10 PRINT"HI" : 20 PRINT 6*7
	const hello = basicProgram([
		{ number: 10, tokens: [0x99, 0x22, 0x48, 0x49, 0x22] },
		{ number: 20, tokens: [0x99, 0x36, 0xac, 0x37] },
	]);
	let m: Machine;
	const ready = (count: number) => () => screen(m).filter((line) => line === "READY.").length >= count;

	beforeEach(() => {
		m = boot();
		m.bus.insertMedia(buildD64({ name: "PET GAMES", id: "PG", files: [{ name: "HELLO", data: hello }] }));
		runUntil(m, ready(1));
	});

	it('lists the directory: LOAD"$",8 then LIST', () => {
		m.bus.typeText('load"$",8\n');
		runUntil(m, ready(2), 20_000_000);
		m.bus.typeText("list\n");
		runUntil(m, () => screen(m).some((line) => line.includes("BLOCKS FREE.")), 20_000_000);
		expect(screen(m)).toEqual(
			expect.arrayContaining([
				' 0 "PET GAMES       " PG 2A', // the header line is in reverse video on the screen
				' 1    "HELLO"            PRG',
				" 663 BLOCKS FREE.",
			]),
		);
	});

	it("loads a program and runs it", () => {
		m.bus.typeText('load"hello",8\n');
		runUntil(m, ready(2), 20_000_000);
		expect(screen(m)).toEqual(expect.arrayContaining(["SEARCHING FOR HELLO", "LOADING"]));
		m.bus.typeText("run\n");
		runUntil(m, () => screen(m).includes(" 42"), 20_000_000);
		expect(screen(m)).toContain("HI");
	});

	/**
	 * The drive sends nothing for a file it hasn't: BASIC 2's LOAD (unlike BASIC 4's) takes the time-out for "no
	 * byte yet" and waits on, until RUN/STOP. The error channel says why.
	 */
	const loadsNothing = (name: string) => {
		m.bus.typeText(`load"${name}",8\n`);
		runUntil(m, () => screen(m).includes("LOADING"), 20_000_000);
		for (let i = 0; i < 1_000_000; i++) stepInstruction(); // ~1 s: nothing comes
		expect(screen(m).filter((line) => line === "READY.").length).toBe(1);
		// RUN/STOP, held: the LOAD loop looks at it once per time-out (~65 ms)
		m.bus.pressKey("Escape", "Escape");
		for (let i = 0; i < 300_000; i++) stepInstruction();
		m.bus.releaseKey("Escape", "Escape");
		runUntil(m, ready(2), 20_000_000);
	};
	/** The error channel, by a program (INPUT# is not for direct mode) */
	const status = (expected: string) => {
		m.bus.typeText("new\n10 open1,8,15:input#1,a,b$:print a;b$:close1\nrun\n");
		runUntil(m, () => screen(m).includes(expected), 20_000_000);
	};

	it("a file that isn't there: LOAD waits for it (RUN/STOP), the error channel says FILE NOT FOUND", () => {
		loadsNothing("nope");
		status(" 62 FILE NOT FOUND");
	});

	it("empty: LOAD waits too (DRIVE NOT READY); SAVE is refused (WRITE PROTECT ON)", () => {
		m.bus.ejectMedia();
		loadsNothing("hello");
		status(" 74 DRIVE NOT READY");
		m.bus.insertMedia(buildD64({ files: [] }));
		m.bus.typeText('save"x",8\n');
		runUntil(m, ready(4), 20_000_000);
		m.bus.typeText('open1,8,15:input#1,a,b$:print a;b$:close1\n');
		status(" 26 WRITE PROTECT ON");
	});

	it("types LOAD and RUN right after a reset: the keys wait for the editor (the bootKeys)", () => {
		m.bus.reset();
		resetCPU();
		m.bus.typeText(pet3032.disk?.bootKeys as string);
		runUntil(m, () => screen(m).includes(" 42"), 40_000_000);
		expect(screen(m)).toEqual(expect.arrayContaining(['LOAD"*",8', "SEARCHING FOR *", "RUN", "HI"]));
	});
});
