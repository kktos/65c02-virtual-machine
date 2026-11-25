import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REG_A_OFFSET, REG_PC_OFFSET, REG_SP_OFFSET, REG_STATUS_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { useCommands } = await import("@/composables/useCommands");
const { useBreakpoints } = await import("@/composables/useBreakpoints");
const { VirtualMachine: VM } = await import("@/virtualmachine/virtualmachine.class");

const { runCommand } = useCommands();
const registers = new DataView(new ArrayBuffer(64));
const memory = new Uint8Array(0x10000);
const fake = {
	isRunningOrStarting: false,
	play: vi.fn(),
	// The worker's stop: the registers are written only after it (updateRegister throws before)
	pauseAndWait: vi.fn(async () => {
		fake.isRunningOrStarting = false;
	}),
	addBP: vi.fn(),
	removeBP: vi.fn(),
	sharedRegisters: registers,
	stateStack: [] as number[][],
	saveRegisters: VM.prototype.saveRegisters,
	restoreRegisters: VM.prototype.restoreRegisters,
	updateRegister: VM.prototype.updateRegister,
	assertPaused: (VM.prototype as unknown as { assertPaused: unknown }).assertPaused,
	writeDebug: (address: number, value: number) => (memory[address] = value),
};
const vm = fake as unknown as VirtualMachine;

const run = (line: string) => runCommand(line, vm, { standalone: true });
const P = () => registers.getUint8(REG_STATUS_OFFSET);

beforeEach(() => {
	vi.clearAllMocks();
	registers.setUint8(REG_A_OFFSET, 0x11);
	registers.setUint8(REG_SP_OFFSET, 0xec);
	registers.setUint8(REG_STATUS_OFFSET, 0x34); // I set
	registers.setUint16(REG_PC_OFFSET, 0xc27d, true);
});

describe("regs", () => {
	it("restore puts every register back, P included", async () => {
		await run("regs save");
		registers.setUint8(REG_A_OFFSET, 0x99);
		registers.setUint8(REG_STATUS_OFFSET, 0x30 | 0x80); // I clear, N set
		await run("regs restore");
		expect(registers.getUint8(REG_A_OFFSET)).toBe(0x11);
		expect(P()).toBe(0x34);
	});

	it("return puts them back but the I flag, which stays as it is", async () => {
		await run("regs save");
		registers.setUint8(REG_A_OFFSET, 0x99);
		registers.setUint8(REG_STATUS_OFFSET, 0x30 | 0x80); // I clear (a CLI), N set
		await run("regs return");
		expect(registers.getUint8(REG_A_OFFSET)).toBe(0x11);
		expect(registers.getUint16(REG_PC_OFFSET, true)).toBe(0xc27d);
		expect(P()).toBe(0x30); // N restored, I as the routine left it
	});

	it("restore refuses while the machine runs (the CPU would write its own registers over it)", async () => {
		await run("regs save");
		registers.setUint8(REG_A_OFFSET, 0x99);
		fake.isRunningOrStarting = true;
		try {
			expect(() => vm.restoreRegisters()).toThrow(/running/);
			expect(registers.getUint8(REG_A_OFFSET)).toBe(0x99);
		} finally {
			fake.isRunningOrStarting = false;
			vm.restoreRegisters();
		}
	});
});

describe("G", () => {
	it("calls the routine, then puts the registers back but the I flag", async () => {
		await run("300G");
		expect(registers.getUint16(REG_PC_OFFSET, true)).toBe(0x300);
		expect(vm.play).toHaveBeenCalled();
		const hook = useBreakpoints().getBreakpoint({ type: "pc", address: 0xffff });
		expect(hook?.isTemporary).toBe(true);
		expect(hook?.command).toBe('regs return;print "done"');
	});

	it("pauses a running machine first, and resumes it after the routine", async () => {
		fake.isRunningOrStarting = true;
		try {
			await run("300G");
			expect(fake.pauseAndWait).toHaveBeenCalled();
			expect(registers.getUint16(REG_PC_OFFSET, true)).toBe(0x300);
			expect(vm.play).toHaveBeenCalled();
			const hook = useBreakpoints().getBreakpoint({ type: "pc", address: 0xffff });
			expect(hook?.command).toBe('regs return;print "done";run');
		} finally {
			fake.isRunningOrStarting = false;
		}
	});
});
