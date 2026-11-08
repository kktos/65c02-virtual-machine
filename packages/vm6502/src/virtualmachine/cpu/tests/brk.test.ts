import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBreakpoint, breakOnBrk, clearBreakpoints, setBreakOnBrk } from "../breakpoints";
import { initCPU, isStoppedOnBrk, setClockSpeed, setHypercalls, setRunning, stepInstruction } from "../cpu.65c02";
import { REG_A_OFFSET, REG_PC_OFFSET, REG_SP_OFFSET, REG_STATUS_OFFSET } from "../shared-memory";
import { createMockBus } from "./cpu-test-helpers";

// Read before any test changes it.
const defaultBreakOnBrk = breakOnBrk;

const FLAG_D = 0x08;
const FLAG_I = 0x04;
const FLAG_B = 0x10;
const FLAG_5 = 0x20;

describe("CPU 65C02 - BRK", () => {
	let memory: Uint8Array;
	let registersView: DataView;
	let postMessage: ReturnType<typeof vi.fn>;

	const messages = () => postMessage.mock.calls.map(([m]) => m);
	const stop = () => messages().find((m) => m.type === "isRunning" && !m.isRunning)?.stop;
	const pc = () => registersView.getUint16(REG_PC_OFFSET, true);
	const sp = () => registersView.getUint8(REG_SP_OFFSET);
	const status = () => registersView.getUint8(REG_STATUS_OFFSET);

	// setRunning(true) runs one time slice synchronously (setTimeout / rAF are stubbed).
	const runFrom = (address: number) => {
		registersView.setUint16(REG_PC_OFFSET, address, true);
		postMessage.mockClear();
		setRunning(true);
	};
	const stepAt = (address: number) => {
		registersView.setUint16(REG_PC_OFFSET, address, true);
		postMessage.mockClear();
		stepInstruction();
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
		registersView.setUint8(REG_STATUS_OFFSET, FLAG_D); // B clear in the register, as after reset
		memory[0xfffe] = 0x00; // BRK/IRQ vector -> $C000
		memory[0xffff] = 0xc0;
		memory[0xc000] = 0xea; // NOP: if the run loop gets there, it just keeps going
	});

	const expectRealBrk = (from: number) => {
		expect(pc()).toBe(0xc000);
		expect(sp()).toBe(0xfc);
		// return address is BRK + 2 (the signature byte is skipped)
		expect(memory[0x1ff]).toBe((from + 2) >> 8);
		expect(memory[0x1fe]).toBe((from + 2) & 0xff);
		// pushed P has B and bit 5 set, so an IRQ handler can tell a BRK from an IRQ
		expect(memory[0x1fd]).toBe(FLAG_D | FLAG_B | FLAG_5);
		expect(status() & FLAG_I).toBe(FLAG_I);
		expect(status() & FLAG_D).toBe(0);
	};

	it("is on by default", () => {
		expect(defaultBreakOnBrk).toBe(true);
	});

	describe("break on BRK on", () => {
		it("stops a running CPU on the BRK, without executing it", () => {
			runFrom(0x300);
			expect(stop()).toEqual({ reason: "brk", address: 0x300 });
			expect(messages()).toContainEqual({ type: "break", address: 0x300, wasRunning: true });
			expect(pc()).toBe(0x300);
			expect(sp()).toBe(0xff);
			expect(isStoppedOnBrk()).toBe(true);
		});

		it("stepping a BRK executes it (no stop, so you can step past it)", () => {
			stepAt(0x300);
			expectRealBrk(0x300);
			expect(messages().some((m) => m.type === "break")).toBe(false);
		});

		it("stepping the BRK it stopped on executes it", () => {
			runFrom(0x300);
			setRunning(false);
			stepInstruction();
			expectRealBrk(0x300);
			expect(isStoppedOnBrk()).toBe(false);
		});
	});

	describe("break on BRK off", () => {
		it("a running BRK goes through the $FFFE vector", () => {
			setBreakOnBrk(false);
			addBreakpoint("pc", 0xc000); // stop in the handler to inspect the state
			runFrom(0x300);
			expect(stop()).toEqual({ reason: "breakpoint", breakpointType: "pc", address: 0xc000 });
			expectRealBrk(0x300);
			expect(isStoppedOnBrk()).toBe(false);
		});
	});

	describe("hypercalls", () => {
		const hypercallMessages = () => messages().filter((m) => m.type === "hypercall");

		beforeEach(() => setHypercalls(true));

		it("run without stopping: decoded in the worker, PC moved past, effect handed to the main thread", () => {
			memory.set([0x00, 0x02], 0x300); // BRK $02: LOG_REGS
			memory.set([0x00, 0x05], 0x302); // plain BRK, to end the run
			registersView.setUint8(REG_A_OFFSET, 0x2a);
			runFrom(0x300);
			expect(hypercallMessages()).toEqual([
				{
					type: "hypercall",
					call: {
						cmd: 0x02,
						address: 0x300,
						length: 2,
						stop: false,
						regs: { A: 0x2a, X: 0, Y: 0, P: FLAG_D, SP: 0xff },
					},
				},
			]);
			// the only stop is the plain BRK after it
			expect(stop()).toEqual({ reason: "brk", address: 0x302 });
		});

		it("LOG_STRING: the message is formatted in the worker, from memory at the time of the call", () => {
			memory.set([0x00, 0x01, 0x00, 0x20, 0x2a], 0x300); // BRK $01 <$2000> <arg $2A>
			memory.set([0xc1, 0xbd, 0x25, 0xe8, 0x00], 0x2000); // "A=%h" in high-bit ASCII
			memory.set([0x00, 0x05], 0x305);
			runFrom(0x300);
			expect(hypercallMessages()[0].call).toMatchObject({ cmd: 0x01, message: "A=2a", length: 5 });
			expect(stop()).toEqual({ reason: "brk", address: 0x305 });
		});

		it("with the stop bit (BRK $82): stops after the call, PC on the next instruction", () => {
			memory.set([0x00, 0x82], 0x300);
			runFrom(0x300);
			expect(stop()).toEqual({ reason: "hypercall", address: 0x300, cmd: 0x02 });
			expect(pc()).toBe(0x302);
			expect(isStoppedOnBrk()).toBe(false); // nothing to skip when resuming
			// the effect is posted before the stop
			const types = messages().map((m) => m.type);
			expect(types.indexOf("hypercall")).toBeLessThan(types.indexOf("isRunning", 1));
		});

		it("stop bit regardless of break on BRK", () => {
			setBreakOnBrk(false);
			memory.set([0x00, 0x81, 0x00, 0x20], 0x300); // LOG_STRING, empty string
			runFrom(0x300);
			expect(stop()).toEqual({ reason: "hypercall", address: 0x300, cmd: 0x01 });
			expect(pc()).toBe(0x304);
		});

		it("stepping runs the whole call, stop bit or not, without reporting a stop", () => {
			memory.set([0x00, 0x82], 0x300);
			stepAt(0x300);
			expect(hypercallMessages()).toHaveLength(1);
			expect(pc()).toBe(0x302);
			expect(messages().some((m) => m.type === "isRunning")).toBe(false);
		});

		it("reads the call with the bus's side-effect-free read when it has one", () => {
			const bus = createMockBus(memory);
			const readDebug = vi.fn((address: number) => memory[address] ?? 0);
			initCPU({ ...bus, readDebug }, registersView, null, memory, new Uint8Array(256));
			setRunning(false);
			memory.set([0x00, 0x81, 0x00, 0x20], 0x300);
			memory.set([0xc8, 0xc9, 0x00], 0x2000); // "HI"
			runFrom(0x300);
			expect(hypercallMessages()[0].call.message).toBe("HI");
			expect(readDebug).toHaveBeenCalledWith(0x2000);
			expect(bus.read).not.toHaveBeenCalledWith(0x2000);
		});

		it("BRK followed by another byte is a normal BRK, stop bit or not", () => {
			memory.set([0x00, 0x05], 0x300);
			runFrom(0x300);
			expect(stop()).toEqual({ reason: "brk", address: 0x300 });
			memory.set([0x00, 0x85], 0x300);
			runFrom(0x300);
			expect(stop()).toEqual({ reason: "brk", address: 0x300 });
			expect(hypercallMessages()).toHaveLength(0);
		});

		it("are plain BRKs on a machine without hypercalls", () => {
			setHypercalls(false);
			memory[0x301] = 0x81;
			runFrom(0x300);
			expect(stop()).toEqual({ reason: "brk", address: 0x300 });
			expect(hypercallMessages()).toHaveLength(0);

			setRunning(false);
			stepInstruction();
			expectRealBrk(0x300);
		});
	});
});
