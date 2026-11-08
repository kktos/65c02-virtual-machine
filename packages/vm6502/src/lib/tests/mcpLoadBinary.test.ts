import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// 128 KB, like main + aux; $C000-$C0FF is I/O and ignores debug writes, as on the Apple bus.
const memory = new Uint8Array(0x20000);
const isRunning = ref(false);
const vm = {
	ready: Promise.resolve(),
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	syncBusState: vi.fn(),
	readDebugRange: (address: number, length: number) => memory.slice(address, address + length),
	writeDebug: vi.fn((address: number, value: number) => {
		if ((address & 0xffff) >= 0xc000 && (address & 0xffff) <= 0xc0ff) return;
		memory[address] = value;
	}),
	updateRegister: vi.fn((reg: string, value: number) => {
		if (reg === "PC") vm.sharedRegisters.setUint16(REG_PC_OFFSET, value, true);
	}),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({ getAddressForLabel: (name: string) => (name === "START" ? 0x6000 : undefined) }),
}));

const { findTool, HOST_FILE_KEY } = await import("@/lib/mcp/tools");
const call = (input: Record<string, unknown>) =>
	findTool("load_binary")!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

// What the vm6502-mcp server sends in place of the path it read.
const hostFile = (name: string, bytes: number[]) => ({
	name,
	path: `/home/me/src/${name}`,
	size: bytes.length,
	data: btoa(String.fromCharCode(...bytes)),
});

describe("load_binary tool", () => {
	beforeEach(() => {
		memory.fill(0);
		isRunning.value = false;
		vm.sharedRegisters.setUint16(REG_PC_OFFSET, 0xfa62, true);
		vi.clearAllMocks();
	});

	it("marks path as a host file for the relay", () => {
		const schema = findTool("load_binary")!.inputSchema as unknown as {
			properties: Record<string, Record<string, unknown>>;
		};
		expect(schema.properties.path?.[HOST_FILE_KEY]).toBe(true);
	});

	it("writes the file at the address", async () => {
		expect(await call({ path: hostFile("prog.bin", [0xa9, 0x01, 0x60]), address: "$300" })).toEqual({
			path: "/home/me/src/prog.bin",
			address: "$0300",
			end_address: "$0302",
			length: 3,
			written: 3,
		});
		expect(Array.from(memory.subarray(0x300, 0x303))).toEqual([0xa9, 0x01, 0x60]);
		expect(vm.syncBusState).toHaveBeenCalled();
		expect(vm.updateRegister).not.toHaveBeenCalled();
	});

	it("takes the address from a #06AAAA file name, labels and banks", async () => {
		expect((await call({ path: hostFile("HELLO#060800", [1, 2]) })).address).toBe("$0800");
		expect((await call({ path: hostFile("hello#06A000.bin", [1]) })).address).toBe("$A000");
		expect(memory[0xa000]).toBe(1);
		// an explicit address wins
		expect((await call({ path: hostFile("HELLO#060800", [7]), address: "START" })).address).toBe("$6000");
		expect((await call({ path: hostFile("aux.bin", [9]), address: "$10400" })).address).toBe("$010400");
		expect(memory[0x10400]).toBe(9);
	});

	it("set_pc: PC at the load address, on a paused machine only", async () => {
		const result = await call({ path: hostFile("prog.bin", [0xea]), address: "$300", set_pc: true });
		expect(vm.updateRegister).toHaveBeenCalledWith("PC", 0x300);
		expect(result).toMatchObject({ PC: "$0300", running: false });

		isRunning.value = true;
		await expect(call({ path: hostFile("prog.bin", [0xea]), address: "$300", set_pc: true })).rejects.toThrow(
			/pause it first/,
		);
	});

	it("reports the ranges that didn't take", async () => {
		const result = await call({ path: hostFile("big.bin", [1, 2, 3, 4, 5]), address: "$BFFE" });
		expect(result).toMatchObject({ written: 2, not_written: [{ address: "$C000", end_address: "$C002" }] });
	});

	it("rejects bad input without writing", async () => {
		await expect(call({})).rejects.toThrow(/path: required/);
		await expect(call({ path: "/tmp/prog.bin", address: 0x300 })).rejects.toThrow(/vm6502-mcp server/);
		await expect(call({ path: hostFile("prog.bin", [1]) })).rejects.toThrow(/address: required.*#06AAAA/);
		await expect(call({ path: hostFile("PROG#FF2000", [1]) })).rejects.toThrow(/address: required/);
		await expect(call({ path: hostFile("empty.bin", []), address: 0x300 })).rejects.toThrow(/empty/);
		await expect(call({ path: hostFile("big.bin", [1, 2, 3]), address: "$FFFE" })).rejects.toThrow(
			/doesn't fit in the bank/,
		);
		expect(vm.writeDebug).not.toHaveBeenCalled();
	});
});
