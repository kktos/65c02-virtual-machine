import { beforeEach, describe, expect, it, vi } from "vitest";
import { REG_A_OFFSET, REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { fakeRegisters } from "@/lib/tests/fakeRegisters";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const registers = fakeRegisters();
const vm = {
	...registers,
	isRunningOrStarting: false,
	// As the VM's: a running machine's registers can't be written
	updateRegister: vi.fn((reg: "A" | "PC", value: number) => {
		if (vm.isRunningOrStarting) throw new Error("running");
		registers.updateRegister(reg, value);
	}),
	pauseAndWait: vi.fn(async () => {
		vm.isRunningOrStarting = false;
	}),
	play: vi.fn(() => {
		vm.isRunningOrStarting = true;
	}),
	writeDebug: vi.fn(),
};

// Commands first: they use defineCommand, which useCommands only has once it is through its own imports.
await import("@/commands");
const { useCommands } = await import("@/composables/useCommands");
const { runCommand } = useCommands();
const run = (line: string) => runCommand(line, vm as never);

describe("SET", () => {
	beforeEach(() => {
		new Uint8Array(vm.registers.buffer).fill(0);
		vm.isRunningOrStarting = false;
		vi.clearAllMocks();
	});

	it("set pc $300 sets PC", async () => {
		const report = await run("set pc $300");
		expect(report).toMatchObject({ ok: true });
		expect(vm.registers.getUint16(REG_PC_OFFSET, true)).toBe(0x300);
	});

	it("set a $12 sets A", async () => {
		expect(await run("set a $12")).toMatchObject({ ok: true });
		expect(vm.registers.getUint8(REG_A_OFFSET)).toBe(0x12);
	});

	it("pc = $300 sets PC", async () => {
		expect(await run("pc = $300")).toMatchObject({ ok: true });
		expect(vm.registers.getUint16(REG_PC_OFFSET, true)).toBe(0x300);
	});

	it("paused: writes, stays paused", async () => {
		expect(await run("set a $12")).toMatchObject({ ok: true });
		expect(vm.pauseAndWait).not.toHaveBeenCalled();
		expect(vm.play).not.toHaveBeenCalled();
	});

	it("running: pauses, writes, runs on", async () => {
		vm.isRunningOrStarting = true;
		expect(await run("set pc $300")).toMatchObject({ ok: true });
		expect(vm.pauseAndWait).toHaveBeenCalledTimes(1);
		expect(vm.registers.getUint16(REG_PC_OFFSET, true)).toBe(0x300);
		expect(vm.play).toHaveBeenCalledTimes(1);
	});

	it("mem[$300] = $12 writes memory", async () => {
		expect(await run("mem[$300] = $12")).toMatchObject({ ok: true });
		expect(vm.writeDebug).toHaveBeenCalledWith(0x300, 0x12);
	});

	it("rejects an unknown register and an out of range value", async () => {
		expect(await run("set foo 1")).toMatchObject({ ok: false, error: "Invalid register: FOO" });
		expect(await run("pc = $10000")).toMatchObject({ ok: false });
	});
});
