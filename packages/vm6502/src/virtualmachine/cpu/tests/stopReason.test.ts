import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBreakpoint, clearBreakpoints } from "../breakpoints";
import { initCPU, resetCPU, setClockSpeed, setRunning, stepOutInstruction } from "../cpu.65c02";
import { REG_PC_OFFSET, REG_SP_OFFSET } from "../shared-memory";
import { createMockBus } from "./cpu-test-helpers";

// The worker sends why it stopped in the `isRunning: false` message.
describe("CPU 65C02 - stop reason", () => {
	let memory: Uint8Array;
	let registersView: DataView;
	let postMessage: ReturnType<typeof vi.fn>;

	const stopMessage = () => postMessage.mock.calls.map(([m]) => m).find((m) => m.type === "isRunning" && !m.isRunning);
	// setRunning(true) runs a time slice synchronously (setTimeout / rAF are stubbed, so only one).
	const runFrom = (pc: number) => {
		registersView.setUint16(REG_PC_OFFSET, pc, true);
		postMessage.mockClear();
		setRunning(true);
	};

	beforeEach(() => {
		postMessage = vi.fn();
		vi.stubGlobal("self", { postMessage });
		vi.stubGlobal("performance", { now: () => 0 });
		// keep the run loop from actually running
		vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
		vi.stubGlobal("setTimeout", vi.fn());

		memory = new Uint8Array(0x10000);
		registersView = new DataView(new ArrayBuffer(64));
		initCPU(createMockBus(memory), registersView, null, memory, new Uint8Array(256));
		setClockSpeed(0);
		clearBreakpoints();
		setRunning(false);
	});

	it("PC breakpoint", () => {
		memory[0x300] = 0xea; // NOP
		addBreakpoint("pc", 0x300);
		runFrom(0x300);
		expect(stopMessage()?.stop).toEqual({ reason: "breakpoint", breakpointType: "pc", address: 0x300 });
	});

	it("write breakpoint: address is the memory address", () => {
		memory.set([0x8d, 0x00, 0x20], 0x300); // STA $2000
		addBreakpoint("write", 0x2000);
		runFrom(0x300);
		expect(stopMessage()?.stop).toEqual({ reason: "breakpoint", breakpointType: "write", address: 0x2000 });
		expect(registersView.getUint16(REG_PC_OFFSET, true)).toBe(0x300);
	});

	it("BRK", () => {
		memory[0x300] = 0x00;
		runFrom(0x300);
		expect(stopMessage()?.stop).toEqual({ reason: "brk", address: 0x300 });
	});

	it("step out", () => {
		registersView.setUint8(REG_SP_OFFSET, 0xfd);
		memory[0x1fe] = 0x02; // return to $0203 (RTS adds 1)
		memory[0x1ff] = 0x02;
		memory[0x1000] = 0x60; // RTS
		registersView.setUint16(REG_PC_OFFSET, 0x1000, true);
		postMessage.mockClear();
		stepOutInstruction();
		expect(stopMessage()?.stop).toEqual({ reason: "step", address: 0x203 });
	});

	it("reset", () => {
		postMessage.mockClear();
		resetCPU();
		expect(stopMessage()?.stop).toEqual({ reason: "reset" });
	});

	it("no stop info when starting", () => {
		postMessage.mockClear();
		setRunning(true);
		expect(postMessage).toHaveBeenCalledWith({ type: "isRunning", isRunning: true, stop: undefined });
	});
});
