import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBreakpoint, clearBreakpoints } from "../breakpoints";
import {
	endStepThrough,
	initCPU,
	resetCPU,
	setClockSpeed,
	setRunning,
	skipBreakpointOnce,
	stepInstruction,
	stepOutInstruction,
	stepOverInstruction,
} from "../cpu.65c02";
import { REG_PC_OFFSET } from "../shared-memory";
import { createMockBus } from "./cpu-test-helpers";

// Step over / out, honouring the breakpoints on the way or going through them.
// The program: $0300 JSR $0400 / $0303 NOP / $0304 BRK; the routine: $0400-$0402 NOPs / $0403 RTS.
describe("CPU 65C02 - step over / out and the breakpoints", () => {
	let memory: Uint8Array;
	let registersView: DataView;
	let postMessage: ReturnType<typeof vi.fn>;

	const pc = () => registersView.getUint16(REG_PC_OFFSET, true);
	/** The stops since the last call (setRunning(true) runs one time slice synchronously: rAF / setTimeout are stubbed). */
	const stops = () => {
		const list = postMessage.mock.calls.map(([m]) => m).filter((m) => m.type === "isRunning" && !m.isRunning);
		postMessage.mockClear();
		return list.map((m) => m.stop);
	};
	/** What the worker's `run` does, stopped on a PC breakpoint. */
	const resume = () => {
		skipBreakpointOnce(pc());
		setRunning(true);
	};
	/** In the routine, called from $0300. */
	const enterRoutine = () => {
		registersView.setUint16(REG_PC_OFFSET, 0x300, true);
		stepInstruction();
		expect(pc()).toBe(0x400);
	};

	beforeEach(() => {
		postMessage = vi.fn();
		vi.stubGlobal("self", { postMessage });
		vi.stubGlobal("performance", { now: () => 0 });
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 0),
		);
		vi.stubGlobal("setTimeout", vi.fn());

		memory = new Uint8Array(0x10000);
		memory.set([0x20, 0x00, 0x04, 0xea], 0x300);
		memory.set([0xea, 0xea, 0xea, 0x60], 0x400);
		registersView = new DataView(new ArrayBuffer(64));
		initCPU(createMockBus(memory), registersView, null, memory, new Uint8Array(256));
		setClockSpeed(0);
		clearBreakpoints();
		resetCPU(); // forgets the previous test's step
		postMessage.mockClear();
	});

	describe("step over", () => {
		it("honour: stops on a breakpoint in the routine, stays armed", () => {
			addBreakpoint("pc", 0x401);
			registersView.setUint16(REG_PC_OFFSET, 0x300, true);
			expect(stepOverInstruction()).toBeUndefined(); // runs
			expect(stops()).toEqual([{ reason: "breakpoint", breakpointType: "pc", address: 0x401 }]);

			resume();
			expect(stops()).toEqual([{ reason: "step", address: 0x303 }]);
		});

		it("through: its breakpoint stops are flagged for the main thread to resume", () => {
			addBreakpoint("pc", 0x401);
			registersView.setUint16(REG_PC_OFFSET, 0x300, true);
			stepOverInstruction(true);
			expect(stops()).toEqual([
				{ reason: "breakpoint", breakpointType: "pc", address: 0x401, stepThrough: true },
			]);

			resume();
			expect(stops()).toEqual([{ reason: "step", address: 0x303 }]);

			// Done: a later breakpoint stop is not the step's
			enterRoutine();
			setRunning(true);
			expect(stops()).toEqual([{ reason: "breakpoint", breakpointType: "pc", address: 0x401 }]);
		});

		it("not on a JSR: a single step, its result", () => {
			registersView.setUint16(REG_PC_OFFSET, 0x303, true);
			expect(stepOverInstruction(true)).toEqual({ executed: 1, address: 0x304 });
			expect(stops()).toEqual([]);
		});
	});

	describe("step out", () => {
		it("honour: stays armed after a breakpoint, even one on its RTS", () => {
			addBreakpoint("pc", 0x403);
			enterRoutine();
			expect(stepOutInstruction()).toBe(true);
			expect(stops()).toEqual([{ reason: "breakpoint", breakpointType: "pc", address: 0x403 }]);

			resume(); // runs the RTS: the step's end
			expect(stops()).toEqual([{ reason: "step", address: 0x303 }]);
		});

		it("started on a breakpoint: doesn't stop there at once", () => {
			addBreakpoint("pc", 0x400);
			enterRoutine();
			stepOutInstruction();
			expect(stops()).toEqual([{ reason: "step", address: 0x303 }]);
		});

		it("through: flagged until the machine stops for something else", () => {
			addBreakpoint("pc", 0x401);
			addBreakpoint("pc", 0x402);
			enterRoutine();
			stepOutInstruction(true);
			expect(stops()).toEqual([
				{ reason: "breakpoint", breakpointType: "pc", address: 0x401, stepThrough: true },
			]);

			setRunning(false, { reason: "pause" }); // the worker's `pause`
			stops();
			resume();
			expect(stops()).toEqual([{ reason: "breakpoint", breakpointType: "pc", address: 0x402 }]);
			resume();
			expect(stops()).toEqual([{ reason: "step", address: 0x303 }]);
		});

		it("endStepThrough: the step goes on honouring the breakpoints", () => {
			addBreakpoint("pc", 0x401);
			addBreakpoint("pc", 0x402);
			enterRoutine();
			stepOutInstruction(true);
			expect(stops()[0]).toMatchObject({ address: 0x401, stepThrough: true });

			endStepThrough();
			resume();
			expect(stops()).toEqual([{ reason: "breakpoint", breakpointType: "pc", address: 0x402 }]);
		});

		it("single-stepping its RTS ends it, quietly", () => {
			addBreakpoint("pc", 0x403);
			enterRoutine();
			stepOutInstruction();
			stops();
			stepInstruction(); // the RTS
			expect(pc()).toBe(0x303);
			expect(stops()).toEqual([]);

			// Not armed any more: the next RTS back to that level doesn't stop it
			clearBreakpoints();
			registersView.setUint16(REG_PC_OFFSET, 0x300, true);
			setRunning(true);
			expect(stops()).toEqual([{ reason: "brk", address: 0x304 }]);
		});

		it("a new step replaces it", () => {
			addBreakpoint("pc", 0x401);
			enterRoutine();
			stepOutInstruction();
			stops();
			registersView.setUint16(REG_PC_OFFSET, 0x303, true);
			stepOverInstruction(); // not a JSR: one step, and the step out is dropped

			clearBreakpoints();
			registersView.setUint16(REG_PC_OFFSET, 0x300, true);
			setRunning(true);
			expect(stops()).toEqual([{ reason: "brk", address: 0x304 }]);
		});
	});
});
