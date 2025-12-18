import { describe, expect, test } from "vitest";
import { step } from "../emulator";
import { REG_A_OFFSET, REG_PC_OFFSET, REG_STATUS_OFFSET } from "../shared-memory";
import { getFlag, N, setupCpu, Z } from "./testUtils";

describe("CPU - LDA (Load Accumulator)", () => {
	// --- Immediate ---
	test("0xA9: LDA #$42 should load 0x42 into A", () => {
		const { bus, registersView } = setupCpu({ a: 0x00, status: Z });
		bus.load(0x0600, [0xa9, 0x42]); // LDA #$42

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0x42);
		expect(getFlag(registersView.getUint8(REG_STATUS_OFFSET), Z)).toBe(false);
		expect(getFlag(registersView.getUint8(REG_STATUS_OFFSET), N)).toBe(false);
		expect(cycles).toBe(2);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0602);
	});

	test("0xA9: LDA #$00 should load 0x00 into A and set Z flag", () => {
		const { bus, registersView } = setupCpu({ a: 0x42, status: 0 });
		bus.load(0x0600, [0xa9, 0x00]); // LDA #$00

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0x00);
		expect(getFlag(registersView.getUint8(REG_STATUS_OFFSET), Z)).toBe(true);
		expect(getFlag(registersView.getUint8(REG_STATUS_OFFSET), N)).toBe(false);
		expect(cycles).toBe(2);
	});

	test("0xA9: LDA #$80 should load 0x80 into A and set N flag", () => {
		const { bus, registersView } = setupCpu({ a: 0x42, status: 0 });
		bus.load(0x0600, [0xa9, 0x80]); // LDA #$80

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0x80);
		expect(getFlag(registersView.getUint8(REG_STATUS_OFFSET), Z)).toBe(false);
		expect(getFlag(registersView.getUint8(REG_STATUS_OFFSET), N)).toBe(true);
		expect(cycles).toBe(2);
	});

	// --- Zero Page ---
	test("0xA5: LDA $10 should load value from address $0010", () => {
		const { bus, registersView } = setupCpu();
		bus.load(0x0600, [0xa5, 0x10]); // LDA $10
		bus.write(0x0010, 0xab);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xab);
		expect(cycles).toBe(3);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0602);
	});

	// --- Zero Page, X ---
	test("0xB5: LDA $10,X should load value from address $0010 + X", () => {
		const { bus, registersView } = setupCpu({ x: 0x05 });
		bus.load(0x0600, [0xb5, 0x10]); // LDA $10,X
		bus.write(0x0015, 0xcd);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xcd);
		expect(cycles).toBe(4);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0602);
	});

	// --- Absolute ---
	test("0xAD: LDA $1234 should load value from address $1234", () => {
		const { bus, registersView } = setupCpu();
		bus.load(0x0600, [0xad, 0x34, 0x12]); // LDA $1234
		bus.write(0x1234, 0xef);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xef);
		expect(cycles).toBe(4);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0603);
	});

	// --- Absolute, X ---
	test("0xBD: LDA $1234,X (no page cross) should take 4 cycles", () => {
		const { bus, registersView } = setupCpu({ x: 0x10 });
		bus.load(0x0600, [0xbd, 0x34, 0x12]); // LDA $1234,X
		bus.write(0x1244, 0xfa);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xfa);
		expect(cycles).toBe(4);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0603);
	});

	test("0xBD: LDA $12FF,X (with page cross) should take 5 cycles", () => {
		const { bus, registersView } = setupCpu({ x: 0x01 });
		bus.load(0x0600, [0xbd, 0xff, 0x12]); // LDA $12FF,X
		bus.write(0x1300, 0xfb);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xfb);
		expect(cycles).toBe(5);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0603);
	});

	// --- Absolute, Y ---
	test("0xB9: LDA $1234,Y (no page cross) should take 4 cycles", () => {
		const { bus, registersView } = setupCpu({ y: 0x10 });
		bus.load(0x0600, [0xb9, 0x34, 0x12]); // LDA $1234,Y
		bus.write(0x1244, 0xfc);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xfc);
		expect(cycles).toBe(4);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0603);
	});

	test("0xB9: LDA $12FF,Y (with page cross) should take 5 cycles", () => {
		const { bus, registersView } = setupCpu({ y: 0x01 });
		bus.load(0x0600, [0xb9, 0xff, 0x12]); // LDA $12FF,Y
		bus.write(0x1300, 0xfd);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xfd);
		expect(cycles).toBe(5);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0603);
	});

	// --- (Indirect, X) ---
	test("0xA1: LDA ($10,X) should load value from pointer", () => {
		const { bus, registersView } = setupCpu({ x: 0x04 });
		bus.load(0x0600, [0xa1, 0x10]); // LDA ($10,X)
		// Pointer at $0014 -> $4050
		bus.write(0x0014, 0x50);
		bus.write(0x0015, 0x40);
		// Value at $4050
		bus.write(0x4050, 0xde);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xde);
		expect(cycles).toBe(6);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0602);
	});

	// --- (Indirect), Y ---
	test("0xB1: LDA ($20),Y (no page cross) should take 5 cycles", () => {
		const { bus, registersView } = setupCpu({ y: 0x10 });
		bus.load(0x0600, [0xb1, 0x20]); // LDA ($20),Y
		// Pointer at $0020 -> $5040
		bus.write(0x0020, 0x40);
		bus.write(0x0021, 0x50);
		// Value at $5040 + Y ($10) = $5050
		bus.write(0x5050, 0xbe);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xbe);
		expect(cycles).toBe(5);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0602);
	});

	test("0xB1: LDA ($20),Y (with page cross) should take 6 cycles", () => {
		const { bus, registersView } = setupCpu({ y: 0x10 });
		bus.load(0x0600, [0xb1, 0x20]); // LDA ($20),Y
		// Pointer at $0020 -> $50F0
		bus.write(0x0020, 0xf0);
		bus.write(0x0021, 0x50);
		// Value at $50F0 + Y ($10) = $5100
		bus.write(0x5100, 0xbf);

		const cycles = step();

		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0xbf);
		expect(cycles).toBe(6);
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x0602);
	});
});
