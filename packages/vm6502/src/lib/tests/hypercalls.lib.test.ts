import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	decodeHypercall,
	formatRegs,
	isHypercallByte,
	runHypercall,
	setHypercallDisassembly,
	type Hypercall,
} from "../hypercalls.lib";
import { applyHypercall } from "@/virtualmachine/hypercall";
import { logBus } from "@/virtualmachine/logbus.class";
import { useMemoryMap } from "@/composables/useMemoryMap";

let memory: Uint8Array;
const readByte = (address: number) => memory[address & 0xffff] ?? 0;
const str = (text: string, highBit = false) => [...text].map((c) => c.charCodeAt(0) | (highBit ? 0x80 : 0)).concat(0);

beforeEach(() => {
	memory = new Uint8Array(0x10000);
});

describe("decodeHypercall", () => {
	it("recognizes commands $01-$04, with or without the stop bit", () => {
		for (const byte of [0x01, 0x02, 0x03, 0x04, 0x81, 0x82, 0x83, 0x84]) expect(isHypercallByte(byte)).toBe(true);
		for (const byte of [0x00, 0x05, 0x7f, 0x80, 0x85, 0xff]) expect(isHypercallByte(byte)).toBe(false);
		memory.set([0x00, 0x05], 0x300);
		expect(decodeHypercall(readByte, 0x300)).toBeUndefined();
	});

	it("LOG_STRING: formats %h from the argument bytes; the length counts them", () => {
		memory.set([0x00, 0x01, 0x00, 0x20, 0x0a, 0xff], 0x300);
		memory.set(str("X=%h Y=%h"), 0x2000);
		expect(decodeHypercall(readByte, 0x300)).toEqual({
			cmd: 0x01,
			address: 0x300,
			length: 6,
			stop: false,
			stringAddr: 0x2000,
			message: "X=0a Y=ff",
		});
	});

	it("LOG_STRING: high-bit Apple II text, `%` and `h` included", () => {
		memory.set([0x00, 0x01, 0x00, 0x20, 0x2a], 0x300);
		memory.set(str("A=%h", true), 0x2000);
		expect(decodeHypercall(readByte, 0x300)).toMatchObject({ message: "A=2a", length: 5 });
	});

	it("LOG_STRING: `%%` is a percent sign, other codes are kept, a $80 byte doesn't end the string", () => {
		memory.set([0x00, 0x01, 0x00, 0x20], 0x300);
		memory.set([0x31, 0x30, 0x30, 0x25, 0x25, 0x20, 0x25, 0x71, 0x80, 0x21, 0x00], 0x2000);
		expect(decodeHypercall(readByte, 0x300)).toMatchObject({ message: "100% %q\0!", length: 4 });
	});

	it("LOG_REGS: reads the registers when given the registers view", () => {
		memory.set([0x00, 0x02], 0x300);
		const registers = new DataView(new ArrayBuffer(64));
		[0x2a, 0x01, 0x02, 0xfd, 0x30].forEach((v, i) => registers.setUint8(i, v)); // A X Y SP P
		expect(decodeHypercall(readByte, 0x300, registers)).toMatchObject({
			cmd: 0x02,
			regs: { A: 0x2a, X: 0x01, Y: 0x02, SP: 0xfd, P: 0x30 },
		});
	});

	it("LOG_REGS, with the stop bit", () => {
		memory.set([0x00, 0x82], 0x300);
		expect(decodeHypercall(readByte, 0x300)).toEqual({ cmd: 0x02, address: 0x300, length: 2, stop: true });
	});

	it("ADD_REGION", () => {
		memory.set([0x00, 0x03, 0x00, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x00], 0x300);
		memory.set(str("GAME", true), 0x2000);
		expect(decodeHypercall(readByte, 0x300)).toMatchObject({
			cmd: 0x03,
			length: 10,
			region: { name: "GAME", start: 0x800, size: 0x1000, bank: 1 },
		});
	});

	it("REMOVE_REGIONS", () => {
		memory.set([0x00, 0x84, 0x02, 0x00, 0x20, 0x10, 0x20], 0x300);
		memory.set(str("A"), 0x2000);
		memory.set(str("B"), 0x2010);
		expect(decodeHypercall(readByte, 0x300)).toMatchObject({ cmd: 0x04, stop: true, length: 7, names: ["A", "B"] });
	});
});

describe("disassembly", () => {
	afterEach(() => setHypercallDisassembly(false));

	it("only on machines with hypercalls", () => {
		memory.set([0x00, 0x02], 0x300);
		expect(runHypercall(readByte, 0x300)).toEqual({ line: undefined, pc: 0x300 });
	});

	it("shows the command, the stop bit and the bytes; next address is after the call", () => {
		setHypercallDisassembly(true);
		memory.set([0x00, 0x81, 0x00, 0x20, 0x2a], 0x300);
		memory.set(str("A=%h", true), 0x2000);
		const { line, pc } = runHypercall(readByte, 0x300);
		expect(pc).toBe(0x305);
		expect(line).toMatchObject({
			opc: "!!LOG_STRING",
			opr: "STOP",
			bytes: "00 81 00 20 2A",
			info: "String @ $2000",
		});
	});
});

describe("applyHypercall (main thread)", () => {
	const call = (c: Partial<Hypercall>) => ({ address: 0x300, length: 2, stop: false, ...c }) as Hypercall;

	it("logs LOG_STRING / LOG_REGS messages", () => {
		const emit = vi.spyOn(logBus, "emit").mockImplementation(() => {});
		applyHypercall(call({ cmd: 0x01, stringAddr: 0x2000, message: "hello" }));
		applyHypercall(call({ cmd: 0x02, regs: { A: 0x2a, X: 1, Y: 2, P: 0x30, SP: 0xff } }));
		expect(emit.mock.calls).toEqual([
			["hyper", "hello"],
			["hyper", "A:2a X:01 Y:02 P:30 SP:ff"],
		]);
		emit.mockRestore();
	});

	it("adds and removes memory regions", () => {
		const { regions, clearRegions } = useMemoryMap();
		clearRegions();
		applyHypercall(call({ cmd: 0x03, region: { name: "GAME", start: 0x800, size: 0x100, bank: 0 } }));
		expect(regions.value).toMatchObject([{ name: "GAME", start: 0x800, size: 0x100, bank: 0, removable: true }]);
		applyHypercall(call({ cmd: 0x04, names: ["GAME"] }));
		expect(regions.value).toEqual([]);
	});
});

it("formatRegs", () => {
	expect(formatRegs({ A: 0, X: 0x10, Y: 0xff, P: 0x24, SP: 0xfd })).toBe("A:00 X:10 Y:ff P:24 SP:fd");
});
