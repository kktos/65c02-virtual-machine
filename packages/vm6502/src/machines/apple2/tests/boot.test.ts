// Boots the real //e (ROMs + AppleBus, no video) in Node.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseHexData } from "@/lib/array.utils";
import { FLOPPY_SIZE } from "@/lib/disk/formats/apple2/diskImage";
import { initCPU, setRunning, stepInstruction } from "@/virtualmachine/cpu/cpu.65c02";
import {
	FLAG_C_MASK,
	MEMORY_OFFSET,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	STACK_METADATA_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
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

describe("text mode (what screen_text reads by default)", () => {
	let m: Machine;
	beforeEach(() => {
		m = boot();
	});

	it("after reset: page 1, 40 columns, text mode", () => {
		expect(m.bus.getTextMode()).toEqual({ page: 1, cols: 40, shown: "full" });
	});

	it("follows the 80COL and PAGE2 switches", () => {
		m.bus.col80 = true;
		m.bus.page2 = true;
		expect(m.bus.getTextMode()).toMatchObject({ page: 2, cols: 80 });
	});

	it("with 80STORE on, PAGE2 picks the memory bank, not the displayed page", () => {
		m.bus.store80 = true;
		m.bus.page2 = true;
		expect(m.bus.getTextMode().page).toBe(1);
	});

	it("graphics: hidden, or only the last 4 rows in mixed mode", () => {
		m.bus.text = false;
		expect(m.bus.getTextMode().shown).toBe("hidden");
		m.bus.mixed = true;
		expect(m.bus.getTextMode().shown).toBe("mixed");
	});

	it("getTextScreen reads the displayed page unless told otherwise", () => {
		m.bus.write(0x400, 0xb1); // "1"
		m.bus.write(0x800, 0xb2); // "2"
		m.bus.page2 = true;
		expect(m.bus.getTextScreen()[0]?.[0]).toBe("2");
		expect(m.bus.getTextScreen({ page: 1 })[0]?.[0]).toBe("1");
	});
});

describe("//e boot of a DOS 3.3 disk in the SmartPort drive: BOOT1 calls the Disk II ReadSector ($C55C)", () => {
	// DOS 3.3 BOOT1 ($0800-$085C, $08FD-$08FF), https://6502disassembly.com/a2-rom/BOOT1.html:
	// reads 10 sectors of track 0 into $B600-$BFFF through ($3E) = $Cn5C, then JMP $B700.
	const BOOT1 = [
		"01 a5 27 c9 09 d0 18 a5 2b 4a 4a 4a 4a 09 c0 85 3f a9 5c 85 3e 18 ad fe 08 6d ff 08 8d fe 08",
		"ae ff 08 30 15 bd 4d 08 85 3d ce ff 08 ad fe 08 85 27 ce fe 08 a6 2b 6c 3e 00",
		"ee fe 08 ee fe 08 20 89 fe 20 93 fe 20 2f fb a6 2b 6c fd 08",
		"00 0d 0b 09 07 05 03 01 0e 0c 0a 08 06 04 02 0f",
	]
		.join(" ")
		.split(" ")
		.map((hex) => Number.parseInt(hex, 16));

	/** A .dsk (DOS order): BOOT1 in T0 S0, logical sector s of track 0 filled with $s0 + 1. */
	const dosDisk = () => {
		const disk = new Uint8Array(FLOPPY_SIZE);
		for (let s = 1; s < 16; s++) disk.fill((s << 4) | 1, s * 256, (s + 1) * 256);
		disk.set(BOOT1);
		disk.set([0x00, 0xb6, 0x09], 0xfd);
		return disk;
	};

	it("loads $B600-$BFFF from track 0 with the DOS 3.3 interleave and jumps to $B700", () => {
		const m = boot();
		m.bus.insertMedia(dosDisk(), { slot: 5, name: "dos33.dsk" });
		runUntil(m, () => pc(m) === 0xb700);
		expect(m.regs.getUint8(REG_X_OFFSET)).toBe(0x50); // slot_index
		expect(m.bus.read(0xb600)).toBe(0x01); // BOOT1 itself: logical sector 0
		for (let s = 1; s <= 9; s++) expect(m.bus.read(0xb600 + s * 256), `page $B${6 + s}`).toBe((s << 4) | 1);
		expect(m.bus.read(0xc000 - 1)).toBe(0x91); // $BFFF: last byte of sector 9
	});

	it("a sector the image hasn't (track $40): the boot failed, the slot scan resumes", () => {
		const m = boot();
		const disk = new Uint8Array(FLOPPY_SIZE);
		disk.set([0x01, 0xa9, 0x40, 0x85, 0x41, 0x4c, 0x5c, 0xc5]); // LDA #$40 / STA $41 / JMP $C55C
		m.bus.insertMedia(disk, { slot: 5, name: "dos33.dsk" });
		runUntil(m, () => pc(m) === 0xc55c);
		runUntil(m, () => pc(m) === 0xfaba, 100); // SLOOP
	});
});

describe("a DOS 3.3 RWTS driving the Disk II in slot 5: found on the stack, patched to call the SmartPort card", () => {
	const IOB = 0x0500;
	const BUFFER = 0x2000;
	const program = [
		[0x0300, [0xa9, IOB >> 8, 0xa0, IOB & 0xff, 0x20, 0x00, 0x04, 0x4c, 0x07, 0x03]], // LDA/LDY IOB, JSR RWTS, done: JMP *
		[0x0400, [0x84, 0x48, 0x85, 0x49, 0x08, 0x20, 0x50, 0x04, 0x28, 0x60]], // RWTS: STY $48 / STA $49 / PHP / JSR RDADR / PLP / RTS
		[0x0450, [0xbd, 0x8c, 0xc0, 0x10, 0xfb, 0x60]], // RDADR: LDA $C08C,X / BPL *-3 / RTS
	] as const;
	const DONE = 0x0307;

	/** IOB: read T$11 S$0F (DOS logical) into $2000, slot 5 drive 1 */
	const setUp = (track = 0x11, sector = 0x0f) => {
		const m = boot();
		const disk = new Uint8Array(FLOPPY_SIZE);
		disk.fill(0xa5, (track * 16 + sector) * 256, (track * 16 + sector + 1) * 256);
		m.bus.insertMedia(disk, { slot: 5, name: "dos33.dsk" });
		for (const [address, bytes] of program) bytes.forEach((byte, i) => m.bus.write(address + i, byte));
		[0x01, 0x50, 0x01, 0x00, track, sector, 0, 0, BUFFER & 0xff, BUFFER >> 8, 0, 0, 0x01, 0xff].forEach((byte, i) =>
			m.bus.write(IOB + i, byte),
		);
		m.regs.setUint8(REG_X_OFFSET, 0x50);
		m.regs.setUint8(REG_SP_OFFSET, 0xff);
		m.regs.setUint16(REG_PC_OFFSET, 0x0300, true);
		return m;
	};

	it("serves the call in progress, returns to the caller, patches the entry and puts the detour back", () => {
		const m = setUp();
		runUntil(m, () => pc(m) === DONE, 1000);
		expect(m.regs.getUint8(REG_SP_OFFSET)).toBe(0xff); // back in the caller, stack balanced
		expect(m.regs.getUint8(REG_A_OFFSET)).toBe(0);
		expect(m.regs.getUint8(REG_STATUS_OFFSET) & FLAG_C_MASK).toBe(0);
		expect(m.bus.read(IOB + 0x0d)).toBe(0); // error code
		expect(m.bus.read(IOB + 0x0e)).toBe(254); // volume found (no VTOC)
		expect([BUFFER, BUFFER + 255].map((a) => m.bus.read(a))).toEqual([0xa5, 0xa5]);
		expect([0x400, 0x401, 0x402].map((a) => m.bus.read(a))).toEqual([0x4c, 0x90, 0xc5]); // JMP $C590
		expect([0x453, 0x454].map((a) => m.bus.read(a))).toEqual([0x10, 0xfb]); // BPL put back
	});

	it("next calls go straight to the card through the patched entry", () => {
		const m = setUp();
		runUntil(m, () => pc(m) === DONE, 1000);
		m.bus.write(IOB + 0x05, 0x00); // T$11 S$00: zeros
		m.bus.write(BUFFER, 0x11);
		m.regs.setUint16(REG_PC_OFFSET, 0x0300, true);
		runUntil(m, () => pc(m) === 0xc590, 10);
		runUntil(m, () => pc(m) === DONE, 10);
		expect(m.bus.read(BUFFER)).toBe(0);
		expect(m.regs.getUint8(REG_SP_OFFSET)).toBe(0xff);
	});

	it("a write: write protected ($10), carry set", () => {
		const m = setUp();
		m.bus.write(IOB + 0x0c, 0x02);
		runUntil(m, () => pc(m) === DONE, 1000);
		expect(m.regs.getUint8(REG_A_OFFSET)).toBe(0x10);
		expect(m.regs.getUint8(REG_STATUS_OFFSET) & FLAG_C_MASK).toBe(FLAG_C_MASK);
		expect(m.bus.read(IOB + 0x0d)).toBe(0x10);
	});

	it("Disk II code not called through a DOS 3.3 RWTS entry is left alone", () => {
		const m = setUp();
		m.bus.write(0x0400, 0xea); // the entry signature broken
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(() => runUntil(m, () => pc(m) === DONE, 1000)).toThrow("not reached");
		expect(m.bus.read(0x0453)).toBe(0x10);
	});
});
