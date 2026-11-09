import { beforeEach, describe, expect, it, vi } from "vitest";
import { REG_A_OFFSET, REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const vm = {
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	writeDebug: vi.fn(),
};

// Commands first: they use defineCommand, which useCommands only has once it is through its own imports.
await import("@/commands");
const { useCommands } = await import("@/composables/useCommands");
const { runCommand } = useCommands();
const run = (line: string) => runCommand(line, vm as never);

describe("SET", () => {
	beforeEach(() => {
		vm.sharedRegisters = new DataView(new ArrayBuffer(64));
		vm.writeDebug.mockClear();
	});

	it("set pc $300 sets PC", async () => {
		const report = await run("set pc $300");
		expect(report).toMatchObject({ ok: true });
		expect(vm.sharedRegisters.getUint16(REG_PC_OFFSET, true)).toBe(0x300);
	});

	it("set a $12 sets A", async () => {
		expect(await run("set a $12")).toMatchObject({ ok: true });
		expect(vm.sharedRegisters.getUint8(REG_A_OFFSET)).toBe(0x12);
	});

	it("pc = $300 sets PC", async () => {
		expect(await run("pc = $300")).toMatchObject({ ok: true });
		expect(vm.sharedRegisters.getUint16(REG_PC_OFFSET, true)).toBe(0x300);
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
