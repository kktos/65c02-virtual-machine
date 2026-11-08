import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// 128 KB, like main + aux; $C000-$C0FF is I/O and ignores debug writes, as on the Apple bus.
const memory = new Uint8Array(0x20000);
const vm = {
	ready: Promise.resolve(),
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	syncBusState: vi.fn(),
	readDebugRange: (address: number, length: number) => memory.slice(address, address + length),
	writeDebug: vi.fn((address: number, value: number) => {
		if ((address & 0xffff) >= 0xc000 && (address & 0xffff) <= 0xc0ff) return;
		memory[address] = value;
	}),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning: ref(false) }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({ getAddressForLabel: (name: string) => (name === "BUF" ? 0x300 : undefined) }),
}));

const { findTool } = await import("@/lib/mcp/tools");
const call = (input: Record<string, unknown>) =>
	findTool("write_memory")!
		.execute(input, {})
		.then((r) => JSON.parse(r));

describe("write_memory tool", () => {
	beforeEach(() => {
		memory.fill(0);
		vm.syncBusState.mockClear();
	});

	it("writes an array of bytes and returns the previous ones", async () => {
		memory.set([1, 2, 3], 0x300);
		expect(await call({ address: "$300", bytes: [0xa9, 0x00, 0x60] })).toEqual({
			address: "$0300",
			length: 3,
			written: 3,
			previous: "01 02 03",
		});
		expect(Array.from(memory.subarray(0x300, 0x303))).toEqual([0xa9, 0x00, 0x60]);
		expect(vm.syncBusState).toHaveBeenCalled();
	});

	it("accepts hex strings: spaced, packed, with $ / 0x / commas", async () => {
		await call({ address: 0x300, bytes: "A9 0 8d" });
		expect(Array.from(memory.subarray(0x300, 0x303))).toEqual([0xa9, 0x00, 0x8d]);
		await call({ address: 0x310, bytes: "A9008D00C0" });
		expect(Array.from(memory.subarray(0x310, 0x315))).toEqual([0xa9, 0x00, 0x8d, 0x00, 0xc0]);
		await call({ address: 0x320, bytes: "$EA,0x60" });
		expect(Array.from(memory.subarray(0x320, 0x322))).toEqual([0xea, 0x60]);
	});

	it("takes labels and banked addresses", async () => {
		await call({ address: "BUF", bytes: [0x42] });
		expect(memory[0x300]).toBe(0x42);
		expect((await call({ address: "$10400", bytes: [0xc1] })).address).toBe("$010400");
		expect(memory[0x10400]).toBe(0xc1);
	});

	it("reports the ranges that didn't take", async () => {
		const result = await call({ address: "$BFFE", bytes: "11 22 33 44 55" });
		expect(result).toMatchObject({
			written: 2,
			not_written: [{ address: "$C000", end_address: "$C002" }],
		});
		expect((await call({ address: "$C010", bytes: [1] })).not_written).toEqual([{ address: "$C010" }]);
	});

	it("rejects bad input without writing", async () => {
		vm.writeDebug.mockClear();
		await expect(call({ address: 0x300, bytes: [256] })).rejects.toThrow(/bytes\[0\]/);
		await expect(call({ address: 0x300, bytes: "ABC" })).rejects.toThrow(/odd/);
		await expect(call({ address: 0x300, bytes: "zz" })).rejects.toThrow(/not hex/);
		await expect(call({ address: 0x300, bytes: "" })).rejects.toThrow(/no bytes/);
		await expect(call({ address: 0x300, bytes: Array.from({ length: 4097 }, () => 0) })).rejects.toThrow(
			/at most 4096/,
		);
		await expect(call({ address: 0x300 })).rejects.toThrow(/bytes/);
		expect(vm.writeDebug).not.toHaveBeenCalled();
	});
});
