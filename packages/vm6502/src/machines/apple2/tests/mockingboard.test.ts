// Mockingboard: the AYs written through the VIAs' ports, the VIAs' timer interrupts on the //e's IRQ line.
import { describe, expect, it, vi } from "vitest";
import { parseHexData } from "@/lib/array.utils";
import { initCPU, setIrqLine, setRunning, stepInstruction, triggerNmi } from "@/virtualmachine/cpu/cpu.65c02";
import { MEMORY_OFFSET, REG_PC_OFFSET, STACK_METADATA_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";
import { AY38910 } from "../slots/mockingboard/ay38910";
import { MockingboardCard } from "../slots/mockingboard/mockingboard.card";

const SAMPLE_RATE = 44100;

/** Writes AY register `reg` the way the drivers do, through VIA `base` ($00 or $80). */
const writeAy = (card: MockingboardCard, reg: number, value: number, base = 0) => {
	card.writeRom(base + 3, 0xff); // DDRA
	card.writeRom(base + 2, 0x07); // DDRB
	card.writeRom(base + 1, reg);
	card.writeRom(base + 0, 0x07); // latch address
	card.writeRom(base + 0, 0x04);
	card.writeRom(base + 1, value);
	card.writeRom(base + 0, 0x06); // write
	card.writeRom(base + 0, 0x04);
};

const render = (ay: AY38910, samples: number) => {
	const out = new Float32Array(samples);
	ay.render(out, 0, samples, SAMPLE_RATE, 1);
	return out;
};

describe("AY-3-8910", () => {
	it("plays a tone of clock / (16 * period)", () => {
		const ay = new AY38910();
		ay.write(0, 0x40); // period 64: ~996 Hz
		ay.write(7, 0x3e); // tone A only
		ay.write(8, 0x0f);
		const out = render(ay, SAMPLE_RATE);
		let rises = 0;
		for (let index = 1; index < out.length; index++) if (out[index]! > 0.2 && out[index - 1]! <= 0.2) rises++;
		expect(rises).toBeGreaterThanOrEqual(994);
		expect(rises).toBeLessThanOrEqual(998);
	});

	it.each([
		[0x09, 0, "\\___"],
		[0x0b, 1 / 3, "\\¯¯¯"],
		[0x0d, 1 / 3, "/¯¯¯"],
		[0x0f, 0, "/___"],
	])("envelope shape %i holds at %d (%s)", (shape, level) => {
		const ay = new AY38910();
		ay.write(7, 0x3f); // no tone, no noise: the amplitude alone
		ay.write(8, 0x10); // A by the envelope
		ay.write(11, 0x01);
		ay.write(13, shape);
		const out = render(ay, 100); // 16 steps of 16 cycles: done after ~6 samples
		expect(out[99]).toBeCloseTo(level);
	});

	it("reads back its registers, masked", () => {
		const ay = new AY38910();
		ay.write(1, 0xff);
		ay.write(8, 0xff);
		expect(ay.read(1)).toBe(0x0f);
		expect(ay.read(8)).toBe(0x1f);
	});
});

describe("Mockingboard card", () => {
	const card = () => new MockingboardCard({ updateIrq: () => undefined }, 4);

	it("writes the AY registers through the VIA ports, and reads them back in read mode", () => {
		const mb = card();
		writeAy(mb, 8, 0x0c);
		writeAy(mb, 9, 0x05, 0x80); // the second AY
		mb.writeRom(1, 0x08);
		mb.writeRom(0, 0x07); // latch register 8
		mb.writeRom(0, 0x04);
		mb.writeRom(3, 0x00); // port A in
		mb.writeRom(0, 0x05); // read
		expect(mb.readRom(1)).toBe(0x0c);
		expect(mb.snapshot().ays[1]![9]).toBe(0x05);
	});

	it("resets the AY while PB2 is low", () => {
		const mb = card();
		writeAy(mb, 8, 0x0c);
		mb.writeRom(0, 0x00);
		expect(mb.snapshot().ays[0]![8]).toBe(0);
	});

	it("mirrors the VIA registers across $Cn00-$Cn7F and $Cn80-$CnFF", () => {
		const mb = card();
		mb.writeRom(0x13, 0x5a); // DDRA of the first VIA
		expect(mb.readRom(0x03)).toBe(0x5a);
		expect(mb.readRom(0x83)).toBe(0x00);
	});

	it("is silent once reset, sounds after an AY setup", () => {
		const mb = card();
		const out = new Float32Array(2048);
		mb.render(out, 0, out.length, SAMPLE_RATE);
		expect(out.every((sample) => sample === 0)).toBe(true);
		writeAy(mb, 0, 0x40);
		writeAy(mb, 7, 0x3e);
		writeAy(mb, 8, 0x0f);
		mb.render(out, 0, out.length, SAMPLE_RATE);
		expect(Math.max(...out) - Math.min(...out)).toBeGreaterThan(0.1);
	});
});

describe("Mockingboard on the //e", () => {
	const boot = () => {
		vi.stubGlobal("self", { postMessage: () => undefined });
		vi.stubGlobal("performance", { now: () => 0 });
		const size = apple2e.memory.size;
		const buffer = new SharedArrayBuffer(MEMORY_OFFSET + size);
		const regs = new DataView(buffer, 0, MEMORY_OFFSET);
		const mem = new Uint8Array(buffer, MEMORY_OFFSET, size);
		const bus = new AppleBus(mem);
		bus.setRegistersView(regs);
		for (const c of apple2e.memory.chunks ?? [])
			bus.load(c.addr, typeof c.data === "string" ? parseHexData(c.data) : (c.data as Uint8Array), c.bank, c.tag);
		initCPU(bus, regs, null, mem, new Uint8Array(buffer, STACK_METADATA_OFFSET, 256));
		setRunning(false);
		setIrqLine(false);
		bus.setInterruptLines({ irq: setIrqLine, nmi: triggerNmi });
		return { bus, regs };
	};

	it("is in slot 7", () => {
		expect(boot().bus.slots[7]).toBeInstanceOf(MockingboardCard);
	});

	it("runs a free-running T1 IRQ handler through the ROM's $3FE vector", () => {
		const { bus, regs } = boot();
		// biome-ignore format: assembly listing
		const program = [
			0x78, // SEI
			0xa9, 0xc0, 0x8d, 0x0e, 0xc7, // LDA #$C0 / STA $C70E: T1 IRQ on
			0xa9, 0x40, 0x8d, 0x0b, 0xc7, // LDA #$40 / STA $C70B: free-run
			0xa9, 0x00, 0x8d, 0x04, 0xc7, // LDA #$00 / STA $C704
			0xa9, 0x10, 0x8d, 0x05, 0xc7, // LDA #$10 / STA $C705: every $1002 cycles
			0x58, // CLI
			0x4c, 0x16, 0x03, // JMP *
		];
		// biome-ignore format: assembly listing
		const handler = [
			0xad, 0x04, 0xc7, // LDA $C704: acknowledged
			0xe6, 0x06, // INC $06
			0xa5, 0x45, // LDA $45: A, as the ROM saved it
			0x40, // RTI
		];
		program.forEach((byte, index) => bus.write(0x300 + index, byte));
		handler.forEach((byte, index) => bus.write(0x320 + index, byte));
		bus.write(0x3fe, 0x20);
		bus.write(0x3ff, 0x03);
		bus.write(0x06, 0);
		regs.setUint16(REG_PC_OFFSET, 0x300, true);

		const start = bus.totalCycles;
		const end = 0x1002 * 10 + 500;
		for (let i = 0; i < 100_000 && bus.totalCycles - start < end; i++) stepInstruction();
		expect(bus.totalCycles - start).toBeGreaterThanOrEqual(end);
		expect(bus.read(0x06)).toBe(10);
	});

	it("drops the IRQ line on reset", () => {
		const { bus } = boot();
		bus.write(0xc70e, 0xc0);
		bus.write(0xc705, 0x00);
		bus.tick(0x200);
		const card = bus.slots[7] as MockingboardCard;
		expect(card.irq).toBe(true);
		bus.reset();
		expect(card.irq).toBe(false);
	});
});
