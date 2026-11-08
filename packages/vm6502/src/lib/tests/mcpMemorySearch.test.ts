import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const memory = new Uint8Array(0x20000);
const vm = {
	ready: Promise.resolve(),
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	syncBusState: vi.fn(),
	readDebugRange: vi.fn((address: number, length: number) => memory.slice(address, address + length)),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning: ref(false) }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({
		getAddressForLabel: (name: string) => (name === "LIVES" ? 0x9a : undefined),
		getLabelForAddress: (addr: number) => (addr === 0x9a ? "LIVES" : undefined),
	}),
}));

const { findTool, resetMemorySearch } = await import("@/lib/mcp/tools");
const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

describe("memory_snapshot / memory_diff tools", () => {
	beforeEach(() => {
		memory.fill(0);
		resetMemorySearch();
		vm.readDebugRange.mockClear();
	});

	it("finds a lives counter in main RAM by default", async () => {
		memory[0x9a] = 3;
		memory[0x2000] = 3;
		expect(await call("memory_snapshot")).toMatchObject({
			ranges: [{ address: "$0000", end_address: "$BFFF" }],
			candidates: 0xc000,
		});
		expect(vm.syncBusState).toHaveBeenCalled();
		expect(vm.readDebugRange).toHaveBeenCalledWith(0, 0xc000);

		expect(await call("memory_diff", { filter: "equals", value: "$03" })).toMatchObject({
			filter: "equals",
			value: "$03",
			before: 0xc000,
			round: 1,
			remaining: 2,
		});

		memory[0x9a] = 2;
		memory[0x2000] = 0;
		expect(await call("memory_diff", { filter: "decreased", by: 1 })).toEqual({
			filter: "decreased",
			by: 1,
			before: 2,
			round: 2,
			remaining: 1,
			candidates: [{ address: "$009A", label: "LIVES", previous: "$03", value: "$02" }],
		});

		// no filter: just look
		memory[0x9a] = 9;
		expect(await call("memory_diff")).toEqual({
			round: 2,
			remaining: 1,
			candidates: [{ address: "$009A", label: "LIVES", previous: "$02", value: "$09" }],
		});
	});

	it("takes a range or several, with labels and banks", async () => {
		expect(await call("memory_snapshot", { address: "LIVES", end_address: "$9F" })).toMatchObject({
			ranges: [{ address: "$009A", end_address: "$009F" }],
			candidates: 6,
		});
		const several = await call("memory_snapshot", {
			ranges: [
				{ address: "$10000", end_address: "$1BFFF" },
				{ address: 0, end_address: "$BFFF" },
			],
		});
		expect(several).toMatchObject({
			ranges: [
				{ address: "$0000", end_address: "$BFFF" },
				{ address: "$010000", end_address: "$01BFFF" },
			],
			candidates: 0x18000,
		});
		memory[0x10123] = 1;
		expect(await call("memory_diff", { filter: "changed", count: 1 })).toEqual({
			filter: "changed",
			before: 0x18000,
			round: 1,
			remaining: 1,
			candidates: [{ address: "$010123", previous: "$00", value: "$01" }],
		});
	});

	it("says when there are more candidates than listed, and when none is left", async () => {
		await call("memory_snapshot", { address: "$300", end_address: "$3FF" });
		const result = await call("memory_diff", { filter: "unchanged", count: 2 });
		expect(result.candidates).toHaveLength(2);
		expect(result).toMatchObject({ remaining: 0x100, more: true });
		expect(await call("memory_diff", { filter: "changed" })).toMatchObject({ remaining: 0, candidates: [] });
		expect((await call("memory_diff", { filter: "changed" })).note).toMatch(/memory_snapshot/);
	});

	it("rejects bad input", async () => {
		await expect(call("memory_diff", { filter: "changed" })).rejects.toThrow(/memory_snapshot first/);
		await expect(call("memory_snapshot", { address: "$300" })).rejects.toThrow(/end_address: required/);
		await expect(call("memory_snapshot", { address: 0, end_address: "$40000" })).rejects.toThrow(/at most/);
		await expect(call("memory_snapshot", { ranges: [] })).rejects.toThrow(/non-empty/);
		await expect(
			call("memory_snapshot", {
				ranges: [
					{ address: 0, end_address: 9 },
					{ address: 5, end_address: 20 },
				],
			}),
		).rejects.toThrow(/overlap/);
		await call("memory_snapshot", { address: "$300", end_address: "$3FF" });
		await expect(call("memory_diff", { filter: "bigger" })).rejects.toThrow(/filter: must be one of/);
		await expect(call("memory_diff", { filter: "equals" })).rejects.toThrow(/value: required/);
		await expect(call("memory_diff", { filter: "equals", value: 256 })).rejects.toThrow(/value/);
		await expect(call("memory_diff", { filter: "changed", value: 1 })).rejects.toThrow(/only with/);
		await expect(call("memory_diff", { filter: "changed", by: 1 })).rejects.toThrow(/only with/);
		// nothing was narrowed by the rejected calls
		expect((await call("memory_diff")).remaining).toBe(0x100);
	});
});
