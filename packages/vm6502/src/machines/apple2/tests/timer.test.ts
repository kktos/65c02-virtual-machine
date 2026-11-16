// The //e's built-in timer ($C0B8-$C0BA), a periodic interrupt source on IMU ID 8.
import { describe, expect, it, vi } from "vitest";
import { parseHexData } from "@/lib/array.utils";
import { initCPU, setIrqLine, setRunning, stepInstruction, triggerNmi } from "@/virtualmachine/cpu/cpu.65c02";
import { MEMORY_OFFSET, REG_PC_OFFSET, STACK_METADATA_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { AppleBus, TIMER_IMU_ID } from "../apple.bus";
import { apple2e } from "../apple.machine";
import { FRAME_CYCLES, TIMER_DEFAULT_PERIOD } from "../bus/apple.timer";

const CTRL = 0xc0b8;
const ACK = 0xc0b9;
const PERIOD = 0xc0ba;

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

const pending = (bus: AppleBus) => bus.imu.getState().pending & (1 << TIMER_IMU_ID);

describe("//e timer", () => {
	it("is stopped at reset: never interrupts a program that didn't start it", () => {
		const { bus } = boot();
		expect(bus.read(CTRL)).toBe(0);
		expect(bus.read(PERIOD)).toBe(TIMER_DEFAULT_PERIOD);
		bus.tick(FRAME_CYCLES * 200);
		expect(pending(bus)).toBe(0);
	});

	it("pulses every PERIOD frames, its line held until acknowledged", () => {
		const { bus } = boot();
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES * TIMER_DEFAULT_PERIOD - 1);
		expect(bus.read(CTRL)).toBe(0x80);
		bus.tick(1);
		expect(bus.read(CTRL)).toBe(0x81); // running, fired
		expect(pending(bus)).not.toBe(0);
		bus.tick(FRAME_CYCLES * 10);
		expect(pending(bus)).not.toBe(0); // held
		bus.write(ACK, 0);
		expect(pending(bus)).toBe(0);
		expect(bus.read(ACK)).toBe(0);
	});

	it("keeps its phase: the next pulse comes a period after the previous one", () => {
		const { bus } = boot();
		bus.write(PERIOD, 2);
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES * 2 + 100); // late by 100 cycles
		bus.write(ACK, 0);
		bus.tick(FRAME_CYCLES * 2 - 101);
		expect(pending(bus)).toBe(0);
		bus.tick(1);
		expect(pending(bus)).not.toBe(0);
	});

	it("stops, and a period of 0 means 256 frames", () => {
		const { bus } = boot();
		bus.write(PERIOD, 0);
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES * 255);
		expect(pending(bus)).toBe(0);
		bus.tick(FRAME_CYCLES);
		expect(pending(bus)).not.toBe(0);
		bus.write(ACK, 0);
		bus.write(CTRL, 0);
		bus.tick(FRAME_CYCLES * 300);
		expect(pending(bus)).toBe(0);
	});

	it("is stopped, its line released, by a reset", () => {
		const { bus } = boot();
		bus.write(PERIOD, 1);
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES);
		expect(pending(bus)).not.toBe(0);
		bus.reset();
		expect(pending(bus)).toBe(0);
		expect(bus.read(CTRL)).toBe(0);
		expect(bus.read(PERIOD)).toBe(TIMER_DEFAULT_PERIOD);
	});

	it("keeps its state in a save state", () => {
		const { bus } = boot();
		bus.write(PERIOD, 3);
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES * 3 + 10);
		const state = structuredClone(bus.snapshot());
		bus.reset();
		bus.restoreSnapshot(state);
		expect(bus.read(CTRL)).toBe(0x81);
		expect(bus.read(PERIOD)).toBe(3);
		expect(pending(bus)).not.toBe(0);
		bus.write(ACK, 0);
		bus.tick(FRAME_CYCLES * 3 - 11);
		expect(pending(bus)).toBe(0);
		bus.tick(1);
		expect(pending(bus)).not.toBe(0);
	});

	// The program of examples/imu-timer.asm (see IMU.md), at a period of one frame
	it("vectored on ID 8: a handler counts the pulses at the top right of the text screen", () => {
		const { bus, regs } = boot();
		// oxfmt-ignore
		const install = [
			0x08,                         // PHP
			0x78,                         // SEI
			0xa9, 0x28, 0x8d, 0xb0, 0xc0, // LDA #$20+8 / STA IMU_INDEX: HANDLER 8
			0xa9, 0x23, 0x8d, 0xb1, 0xc0, // LDA #<TICK / STA IMU_DATALO: staged
			0xa9, 0x03, 0x8d, 0xb2, 0xc0, // LDA #>TICK / STA IMU_DATAHI: committed
			0xa9, 0x00, 0x8d, 0xb0, 0xc0, // LDA #$00 / STA IMU_INDEX: CTRL
			0xa9, 0x80, 0x8d, 0xb1, 0xc0, // LDA #$80 / STA IMU_DATALO: vectoring on
			0xa9, 0x80, 0x8d, 0xb8, 0xc0, // LDA #$80 / STA TMR_CTRL: timer on
			0x28,                         // PLP
			0x58,                         // CLI
			0x60,                         // RTS
		];
		// oxfmt-ignore
		const tick = [
			0x48,                         // $0323 TICK: PHA
			0x8d, 0xb9, 0xc0,             // STA TMR_ACK: the timer releases its line
			0xf8,                         // SED
			0x18,                         // CLC
			0xad, 0x65, 0x03,             // LDA COUNT
			0x69, 0x01,                   // ADC #1
			0x8d, 0x65, 0x03,             // STA COUNT
			0xad, 0x66, 0x03,             // LDA COUNT+1
			0x69, 0x00,                   // ADC #0
			0x8d, 0x66, 0x03,             // STA COUNT+1
			0xd8,                         // CLD
			0xad, 0x66, 0x03,             // LDA COUNT+1
			0x20, 0x57, 0x03,             // JSR DIGITS
			0x8d, 0x25, 0x04,             // STA $0425
			0x8e, 0x24, 0x04,             // STX $0424
			0xad, 0x65, 0x03,             // LDA COUNT
			0x20, 0x57, 0x03,             // JSR DIGITS
			0x8d, 0x27, 0x04,             // STA $0427
			0x8e, 0x26, 0x04,             // STX $0426
			0x8d, 0xb3, 0xc0,             // STA IMU_EOI
			0x68,                         // PLA
			0x40,                         // RTI
			0x48,                         // $0357 DIGITS: PHA
			0x4a, 0x4a, 0x4a, 0x4a,       // LSR x4
			0x09, 0xb0,                   // ORA #$B0
			0xaa,                         // TAX
			0x68,                         // PLA
			0x29, 0x0f,                   // AND #$0F
			0x09, 0xb0,                   // ORA #$B0
			0x60,                         // RTS
			0x00, 0x00,                   // $0365 COUNT
		];
		// oxfmt-ignore
		const main = [
			0xa9, 0x01, 0x8d, 0xba, 0xc0, // LDA #1 / STA TMR_PERIOD: every frame (keeps the test short)
			0x20, 0x00, 0x03,             // JSR INSTALL
			0x4c, 0x88, 0x02,             // JMP *
		];
		[...install, ...tick].forEach((byte, index) => bus.write(0x300 + index, byte));
		main.forEach((byte, index) => bus.write(0x280 + index, byte));
		bus.write(0x3fe, 0x00); // $3FE → $0000: the ROM path would never count
		bus.write(0x3ff, 0x00);
		regs.setUint16(REG_PC_OFFSET, 0x280, true);

		const start = bus.totalCycles;
		for (let i = 0; i < 100_000 && bus.totalCycles - start < FRAME_CYCLES * 12 + 200; i++) stepInstruction();

		const text = [0x424, 0x425, 0x426, 0x427].map((addr) => String.fromCharCode(bus.read(addr) & 0x7f)).join("");
		expect(text).toBe("0012");
		expect(bus.read(0xc0b3)).toBe(0xff); // CURRENT: nothing in service
		expect(bus.imu.getFrames()).toHaveLength(0);
	});
});
