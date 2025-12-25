// c:\devwork\65c02-virtual-machine\packages\vm6502\src\cpu\tests\stepOut.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBus } from "../bus.interface";
import { initCPU, setRunning, stepOutInstruction } from "../cpu.65c02";
import { REG_PC_OFFSET, REG_SP_OFFSET } from "../shared-memory";

describe("CPU 65C02 - Step Out Instruction", () => {
	let bus: IBus;
	let memory: Uint8Array;
	let registers: ArrayBuffer;
	let registersView: DataView;
	let postMessageSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		memory = new Uint8Array(0x2100);

		// Mock Bus
		bus = {
			read: vi.fn((address: number) => memory[address] ?? 0),
			write: vi.fn((address: number, value: number) => {
				memory[address] = value;
			}),
		};

		// Initialize Registers
		registers = new ArrayBuffer(64);
		registersView = new DataView(registers);

		// Mock self for worker environment
		postMessageSpy = vi.fn();
		vi.stubGlobal("self", { postMessage: postMessageSpy });

		// Initialize CPU
		initCPU(bus, registersView);

		// Ensure CPU is stopped
		setRunning(false);
		postMessageSpy.mockClear();
	});

	it("should run until the subroutine returns (RTS)", () => {
		// 1. Setup Stack for Return Address
		// We want to return to 0x0203.
		// RTS pulls PC from stack and adds 1. So stack should have 0x0202.
		const sp = 0xfd;
		const returnAddr = 0x0203;
		const stackVal = returnAddr - 1; // 0x0202

		registersView.setUint8(REG_SP_OFFSET, sp);
		memory[0x01fe] = stackVal & 0xff; // 0x02
		memory[0x01ff] = (stackVal >> 8) & 0xff; // 0x02

		// 2. Setup PC at subroutine (RTS instruction)
		const pc = 0x1000;
		registersView.setUint16(REG_PC_OFFSET, pc, true);

		// Write RTS (0x60) at 0x1000
		memory[pc] = 0x60;

		// Write NOP (0xEA) at return address 0x0203
		memory[returnAddr] = 0xea;

		// 3. Execute Step Out
		stepOutInstruction();

		// 4. Assertions
		// Check if breakpoint hit message was sent
		expect(postMessageSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "breakpointHit",
				breakpointType: "step",
				address: returnAddr,
			}),
		);

		// Check PC is at return address
		const newPC = registersView.getUint16(REG_PC_OFFSET, true);
		expect(newPC).toBe(returnAddr);
	});

	it("should handle nested subroutines correctly", () => {
		const sp = 0xfd;
		const returnAddr1 = 0x0203; // Target for Step Out
		const stackVal1 = returnAddr1 - 1;

		registersView.setUint8(REG_SP_OFFSET, sp);
		memory[0x01fe] = stackVal1 & 0xff;
		memory[0x01ff] = (stackVal1 >> 8) & 0xff;

		const pc = 0x1000;
		registersView.setUint16(REG_PC_OFFSET, pc, true);

		// 0x1000: JSR $2000
		memory[0x1000] = 0x20;
		memory[0x1001] = 0x00;
		memory[0x1002] = 0x20;
		// 0x1003: RTS
		memory[0x1003] = 0x60;
		// 0x2000: RTS
		memory[0x2000] = 0x60;
		// 0x0203: NOP (Final destination)
		memory[0x0203] = 0xea;

		stepOutInstruction();

		expect(postMessageSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "breakpointHit",
				breakpointType: "step",
				address: returnAddr1,
			}),
		);

		const finalPC = registersView.getUint16(REG_PC_OFFSET, true);
		expect(finalPC).toBe(returnAddr1);
	});
});
