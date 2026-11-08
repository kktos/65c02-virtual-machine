import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const vm = {
	ready: Promise.resolve(),
	addBP: vi.fn(),
	removeBP: vi.fn(),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning: ref(false) }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({ getAddressForLabel: (l: string) => (l === "KEYIN" ? 0xfd1b : undefined) }),
}));

const { findTool } = await import("@/lib/mcp/tools");
const { useBreakpoints } = await import("@/composables/useBreakpoints");

const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));
const set = (input: Record<string, unknown>) => call("set_breakpoint", input);
const remove = (input: Record<string, unknown>) => call("remove_breakpoint", input);
const list = (input: Record<string, unknown> = {}) => call("list_breakpoints", input);

describe("breakpoint tools", () => {
	beforeEach(async () => {
		await useBreakpoints().loadBreakpoints(); // empty store (localStorage stub)
		vm.addBP.mockClear();
		vm.removeBP.mockClear();
	});

	it("set_breakpoint adds a PC breakpoint by default, in the store and the VM", async () => {
		expect(await set({ address: "$300" })).toEqual({
			result: "added",
			breakpoint: { type: "pc", address: "$0300", enabled: true },
		});
		expect(vm.addBP).toHaveBeenCalledWith("pc", 0x300, undefined);
		expect(await list()).toEqual({ count: 1, breakpoints: [{ type: "pc", address: "$0300", enabled: true }] });
	});

	it("accepts labels and ranges; a one-byte range is a plain address", async () => {
		expect((await set({ address: "KEYIN" })).breakpoint.address).toBe("$FD1B");
		expect((await set({ type: "write", address: "$400", end_address: "$7FF" })).breakpoint).toMatchObject({
			type: "write",
			address: "$0400",
			end_address: "$07FF",
		});
		expect(vm.addBP).toHaveBeenLastCalledWith("write", 0x400, 0x7ff);
		expect((await set({ type: "read", address: "$C000", end_address: "$C000" })).breakpoint).not.toHaveProperty(
			"end_address",
		);
	});

	it("rejects bad input", async () => {
		await expect(set({ address: "$300", type: "exec" })).rejects.toThrow(/type/);
		await expect(set({ type: "read", address: "$400", end_address: "$300" })).rejects.toThrow(/end_address/);
		await expect(set({ address: "$300", end_address: "$310" })).rejects.toThrow(/read \/ write/);
		await expect(remove({})).rejects.toThrow(/address/);
	});

	it("is idempotent: unchanged, or re-enabled / new command → updated", async () => {
		await set({ address: "$300" });
		expect((await set({ address: "$300" })).result).toBe("unchanged");
		expect(vm.addBP).toHaveBeenCalledTimes(1);

		useBreakpoints().toggleBreakpointEnable({ type: "pc", address: 0x300 }, vm as never);
		expect(await set({ address: "$300", command: "regs;run" })).toEqual({
			result: "updated",
			breakpoint: { type: "pc", address: "$0300", enabled: true, command: "regs;run" },
		});
		expect((await set({ address: "$300", command: "regs;run" })).result).toBe("unchanged");
		expect((await set({ address: "$300", command: "" })).breakpoint).not.toHaveProperty("command");
	});

	it("remove_breakpoint removes the matching one, not_found otherwise", async () => {
		await set({ type: "write", address: "$400", end_address: "$7FF" });
		expect((await remove({ type: "write", address: "$400" })).result).toBe("not_found");
		expect(await remove({ type: "write", address: "$400", end_address: "$7FF" })).toEqual({
			result: "removed",
			breakpoint: { type: "write", address: "$0400", end_address: "$07FF", enabled: true },
		});
		expect(vm.removeBP).toHaveBeenCalledWith("write", 0x400, 0x7ff);
		expect((await list()).count).toBe(0);
	});

	it("remove_breakpoint all", async () => {
		await set({ address: "$300" });
		await set({ type: "read", address: "$C000" });
		expect(await remove({ all: true })).toMatchObject({ result: "removed", count: 2 });
		expect((await list()).count).toBe(0);
	});

	it("list_breakpoints filters by address or range", async () => {
		await set({ address: "$300" });
		await set({ type: "write", address: "$400", end_address: "$7FF" });
		await set({ type: "read", address: "$C000" });
		expect((await list({ address: "$500" })).breakpoints).toEqual([
			{ type: "write", address: "$0400", end_address: "$07FF", enabled: true },
		]);
		expect((await list({ address: "$200", end_address: "$400" })).count).toBe(2);
		expect((await list({ address: "$900" })).count).toBe(0);
	});
});
