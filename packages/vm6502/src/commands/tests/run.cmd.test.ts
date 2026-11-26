import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { fakeRegisters } from "@/lib/tests/fakeRegisters";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { useCommands } = await import("@/composables/useCommands");
const { useBreakpoints } = await import("@/composables/useBreakpoints");
const { useRunUntil } = await import("@/composables/useRunUntil");

const { runCommand } = useCommands();
const registers = new DataView(new ArrayBuffer(64));
const fake = {
	isRunningOrStarting: false,
	play: vi.fn(),
	pauseAndWait: vi.fn(async () => {
		fake.isRunningOrStarting = false;
	}),
	addBP: vi.fn(),
	removeBP: vi.fn(),
	...fakeRegisters(registers),
};
const vm = fake as unknown as VirtualMachine;

const run = (line: string) => runCommand(line, vm, { standalone: true });

beforeEach(() => {
	useRunUntil().cancelRunUntil(vm);
	vi.clearAllMocks();
	registers.setUint16(REG_PC_OFFSET, 0, true);
	fake.isRunningOrStarting = false;
});

describe("RUN", () => {
	it("runs at PC, or at an address", async () => {
		expect((await run("run")).error).toBeUndefined();
		expect(vm.play).toHaveBeenCalledTimes(1);
		await run("run $0800");
		expect(useRunUntil().getRunUntilTarget()).toBeNull();
	});

	it("at an address on a running machine: pauses first (PC is written paused), then runs", async () => {
		fake.isRunningOrStarting = true;
		expect((await run("run $0800")).error).toBeUndefined();
		expect(fake.pauseAndWait).toHaveBeenCalledTimes(1);
		expect(registers.getUint16(REG_PC_OFFSET, true)).toBe(0x0800);
		expect(vm.play).toHaveBeenCalledTimes(1);
	});

	it("until: arms the target, a temporary breakpoint", async () => {
		const report = await run("run until $3F2E");
		expect(report.error).toBeUndefined();
		expect(useRunUntil().getRunUntilTarget()).toEqual({ address: 0x3f2e, through: false });
		expect(useBreakpoints().getBreakpoint({ type: "pc", address: 0x3f2e })?.isTemporary).toBe(true);
		expect(vm.play).toHaveBeenCalledTimes(1);
	});

	it("from an address, until, through", async () => {
		const report = await run("run $0800 until $3F2E through");
		expect(report.error).toBeUndefined();
		expect(useRunUntil().getRunUntilTarget()).toEqual({ address: 0x3f2e, through: true });
	});

	it("a new run until replaces the previous target", async () => {
		await run("run until $3F2E");
		await run("run until $4000");
		expect(useBreakpoints().getBreakpoint({ type: "pc", address: 0x3f2e })).toBeUndefined();
		expect(useRunUntil().getRunUntilTarget()?.address).toBe(0x4000);
	});

	it("rejects a malformed line", async () => {
		expect((await run("run until")).error).toMatch(/address to run until/);
		expect((await run("run $0800 through")).error).toMatch(/until/);
		expect((await run("run until $3F2E fast")).error).toMatch(/through/);
		expect(vm.play).not.toHaveBeenCalled();
	});
});
