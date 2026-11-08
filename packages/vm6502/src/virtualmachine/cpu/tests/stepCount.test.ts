import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBreakpoint, clearBreakpoints } from "../breakpoints";
import { initCPU, setBreakOnBrk, setClockSpeed, setHypercalls, setRunning, stepInstructions } from "../cpu.65c02";
import { REG_A_OFFSET, REG_PC_OFFSET, REG_SP_OFFSET } from "../shared-memory";
import { createMockBus } from "./cpu-test-helpers";

describe("stepInstructions: a step of several instructions", () => {
	let memory: Uint8Array;
	let registersView: DataView;
	let postMessage: ReturnType<typeof vi.fn>;
	const pc = () => registersView.getUint16(REG_PC_OFFSET, true);
	const stepFrom = (address: number, count: number) => {
		registersView.setUint16(REG_PC_OFFSET, address, true);
		postMessage.mockClear();
		return stepInstructions(count);
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
		registersView = new DataView(new ArrayBuffer(64));
		initCPU(createMockBus(memory), registersView, null, memory, new Uint8Array(256));
		setClockSpeed(0);
		clearBreakpoints();
		setRunning(false);
		setBreakOnBrk(true);
		setHypercalls(false);
		registersView.setUint8(REG_SP_OFFSET, 0xff);

		// $300: INX ×3, LDA #$42, NOP…
		memory.set([0xe8, 0xe8, 0xe8, 0xa9, 0x42], 0x300);
		memory.fill(0xea, 0x305, 0x320);
	});

	it("executes `count` instructions", () => {
		expect(stepFrom(0x300, 4)).toEqual({ executed: 4, address: 0x305 });
		expect(registersView.getUint8(REG_A_OFFSET)).toBe(0x42);
	});

	it("count 1 is a single step", () => {
		expect(stepFrom(0x300, 1)).toEqual({ executed: 1, address: 0x301 });
	});

	it("stops before an instruction with a PC breakpoint, but not on the first one", () => {
		addBreakpoint("pc", 0x300);
		addBreakpoint("pc", 0x303);
		expect(stepFrom(0x300, 10)).toEqual({
			executed: 3,
			address: 0x303,
			stop: { reason: "breakpoint", breakpointType: "pc", address: 0x303 },
		});
		// From the breakpoint, the next step executes it.
		expect(stepInstructions(1)).toEqual({ executed: 1, address: 0x305 });
	});

	it("ignores read / write breakpoints, like a single step", () => {
		memory.set([0x8d, 0x00, 0x20], 0x305); // STA $2000
		addBreakpoint("write", 0x2000);
		expect(stepFrom(0x305, 2)).toEqual({ executed: 2, address: 0x309 });
		expect(memory[0x2000]).toBe(0);
	});

	it("stops after a hypercall with the stop bit, without a running-state message", () => {
		setHypercalls(true);
		memory.set([0x00, 0x82], 0x305); // LOG_REGS + stop
		expect(stepFrom(0x300, 10)).toEqual({
			executed: 5, // INX ×3, LDA, the call
			address: 0x307,
			stop: { reason: "hypercall", address: 0x305, cmd: 0x02 },
		});
		expect(postMessage.mock.calls.some(([m]) => m.type === "isRunning")).toBe(false);
	});

	it("a hypercall without the stop bit doesn't stop it", () => {
		setHypercalls(true);
		memory.set([0x00, 0x02], 0x305); // LOG_REGS
		expect(stepFrom(0x305, 3)).toEqual({ executed: 3, address: 0x309 });
	});

	it("renders the screen once, after the last instruction", () => {
		const video = { tick: vi.fn(), reset: vi.fn() };
		initCPU(createMockBus(memory), registersView, video as never, memory, new Uint8Array(256));
		stepFrom(0x300, 4);
		expect(video.tick).toHaveBeenCalledTimes(1);
	});

	it("does nothing while running", () => {
		memory.set([0x4c, 0x30, 0x03], 0x330); // JMP $0330
		registersView.setUint16(REG_PC_OFFSET, 0x330, true);
		setRunning(true); // runs one time slice and stays running (setTimeout is stubbed)
		const at = pc();
		expect(stepInstructions(5)).toEqual({ executed: 0, address: at });
	});
});
