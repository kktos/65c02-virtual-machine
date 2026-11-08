import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBreakpoint, clearBreakpoints } from "../breakpoints";
import { initCPU, setBreakOnBrk, setClockSpeed, setHypercalls, setRunning, stepInstructions } from "../cpu.65c02";
import { readInstructionTrace, recordInstruction, setInstructionTrace, unpackTraceEntries } from "../instructionTrace";
import { REG_PC_OFFSET, REG_SP_OFFSET, REG_STATUS_OFFSET } from "../shared-memory";
import { createMockBus } from "./cpu-test-helpers";

const addresses = (count?: number) => unpackTraceEntries(readInstructionTrace(count).words).map((e) => e.address);

describe("instruction trace ring", () => {
	beforeEach(() => setInstructionTrace(false));

	it("rounds the size up to a power of two and keeps the last entries, oldest first", () => {
		setInstructionTrace(true, 3);
		for (let i = 0; i < 6; i++) recordInstruction(0x300 + i, 0, 0, 0, 0, 0);
		const snapshot = readInstructionTrace();
		expect(snapshot).toMatchObject({ enabled: true, capacity: 4, total: 6 });
		expect(addresses()).toEqual([0x302, 0x303, 0x304, 0x305]);
		expect(addresses(2)).toEqual([0x304, 0x305]);
		expect(addresses(10)).toHaveLength(4);
	});

	it("packs a banked address and every register, high bits included", () => {
		setInstructionTrace(true, 8);
		recordInstruction(0x1d123, 0xff, 0x80, 0x7f, 0xb1, 0xfe);
		expect(unpackTraceEntries(readInstructionTrace().words)).toEqual([
			{ address: 0x1d123, a: 0xff, x: 0x80, y: 0x7f, p: 0xb1, sp: 0xfe },
		]);
	});

	it("off keeps what was recorded; on again starts cleared", () => {
		setInstructionTrace(true, 8);
		recordInstruction(0x300, 0, 0, 0, 0, 0);
		setInstructionTrace(false);
		expect(readInstructionTrace()).toMatchObject({ enabled: false, total: 1 });
		setInstructionTrace(true, 8);
		expect(readInstructionTrace()).toMatchObject({ enabled: true, total: 0 });
	});
});

describe("the CPU records executed instructions", () => {
	let memory: Uint8Array;
	let registersView: DataView;

	beforeEach(() => {
		vi.stubGlobal("self", { postMessage: vi.fn() });
		vi.stubGlobal("performance", { now: () => 0 });
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 0),
		);
		vi.stubGlobal("setTimeout", vi.fn());

		memory = new Uint8Array(0x10000);
		registersView = new DataView(new ArrayBuffer(64));
		initCPU(createMockBus(memory), registersView, null, memory, new Uint8Array(256));
		setClockSpeed(0);
		clearBreakpoints();
		setRunning(false);
		setBreakOnBrk(true);
		setHypercalls(false);
		registersView.setUint8(REG_SP_OFFSET, 0xff);
		registersView.setUint8(REG_STATUS_OFFSET, 0x24);

		// $300: INX ×3, LDA #$42, JMP $0300
		memory.set([0xe8, 0xe8, 0xe8, 0xa9, 0x42, 0x4c, 0x00, 0x03], 0x300);
		registersView.setUint16(REG_PC_OFFSET, 0x300, true);
		setInstructionTrace(true, 16);
	});

	it("each instruction with the registers before it", () => {
		stepInstructions(6);
		const entries = unpackTraceEntries(readInstructionTrace().words);
		expect(entries.map((e) => e.address)).toEqual([0x300, 0x301, 0x302, 0x303, 0x305, 0x300]);
		expect(entries.map((e) => e.x)).toEqual([0, 1, 2, 3, 3, 3]);
		expect(entries[3]).toMatchObject({ a: 0, sp: 0xff }); // before LDA #$42
		expect(entries[4]).toMatchObject({ a: 0x42 });
	});

	it("an instruction stopped on by a breakpoint isn't recorded (it didn't execute)", () => {
		// Running from $0301 stops on the breakpoint at $0303 (LDA), before executing it.
		addBreakpoint("pc", 0x303);
		stepInstructions(1); // $0300 executed
		setRunning(true); // runs synchronously until the breakpoint
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x303);
		expect(addresses()).toEqual([0x300, 0x301, 0x302]);
		// Running again from there stops on it again: still not recorded.
		setRunning(true);
		expect(addresses()).toEqual([0x300, 0x301, 0x302]);
	});

	it("records nothing when off", () => {
		setInstructionTrace(false);
		const before = readInstructionTrace().total;
		stepInstructions(3);
		expect(readInstructionTrace().total).toBe(before);
	});
});
