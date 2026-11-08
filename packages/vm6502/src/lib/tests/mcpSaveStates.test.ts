import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { SaveStateInfo } from "@/virtualmachine/cpu/saveStates";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// The worker's store, in memory.
const states = new Map<string, SaveStateInfo>();
const isRunning = ref(true);
const inserted = shallowRef<{ key: string; name: string; type: "physical"; size: number } | null>(null);
const vm = {
	ready: Promise.resolve(),
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	syncBusState: vi.fn(),
	saveMachineState: vi.fn(async (name: string, meta: Record<string, unknown>) => {
		const info = { name, pc: 0xc28b, cycles: 1000, createdAt: Date.UTC(2026, 10, 8), bytes: 151_822, meta };
		states.delete(name);
		states.set(name, info);
		return info;
	}),
	restoreMachineState: vi.fn(async (name: string) => {
		const info = states.get(name);
		if (info) isRunning.value = false; // the worker pauses the machine
		return info;
	}),
	listMachineStates: vi.fn(async () => [...states.values()]),
	deleteMachineStates: vi.fn(async (name?: string) => {
		if (name === undefined) {
			const names = [...states.keys()];
			states.clear();
			return names;
		}
		return states.delete(name) ? [name] : [];
	}),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));
vi.mock("@/composables/useDiskDrive", () => ({ DISK_EXTENSIONS: [], useDiskDrive: () => ({ inserted }) }));

const { findTool } = await import("@/lib/mcp/tools");
const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

const CONAN = { key: "conan.po", name: "Conan", type: "physical" as const, size: 143360 };

describe("save state tools", () => {
	beforeEach(() => {
		states.clear();
		isRunning.value = true;
		inserted.value = CONAN;
		vi.clearAllMocks();
	});

	it("save_state: saves under `default`, with the disk in the drive; then replaces", async () => {
		expect(await call("save_state")).toEqual({
			result: "saved",
			state: {
				name: "default",
				pc: "$C28B",
				cycles: 1000,
				created: "2026-11-08T00:00:00.000Z",
				bytes: 151_822,
				disk: { key: "conan.po", name: "Conan" },
			},
		});
		expect(vm.saveMachineState).toHaveBeenCalledWith("default", { disk: { key: "conan.po", name: "Conan" } });
		expect((await call("save_state", { name: "default" })).result).toBe("replaced");
		inserted.value = null;
		expect((await call("save_state", { name: " boss " })).state).toMatchObject({ name: "boss", disk: null });
	});

	it("restore_state: paused, bus synced, registers returned", async () => {
		await call("save_state", { name: "boss" });
		const result = await call("restore_state", { name: "boss" });
		expect(result).toMatchObject({ result: "restored", state: { name: "boss" }, running: false });
		expect(result).not.toHaveProperty("disk_note");
		expect(vm.syncBusState).toHaveBeenCalled();
	});

	it("restore_state: says when the toolbar's disk is not the saved one", async () => {
		await call("save_state");
		inserted.value = { ...CONAN, key: "other.po", name: "Other" };
		expect((await call("restore_state")).disk_note).toMatch(/saved state's disk \(Conan\).*still shows Other/);
		inserted.value = null;
		expect((await call("restore_state")).disk_note).toMatch(/still shows no disk/);
	});

	it("restore_state: unknown name lists the states", async () => {
		await expect(call("restore_state", { name: "x" })).rejects.toThrow(/no save state 'x' \(none saved\)/);
		await call("save_state", { name: "a" });
		await call("save_state", { name: "b" });
		await expect(call("restore_state", { name: "x" })).rejects.toThrow(/have: a, b/);
		await expect(call("restore_state", { name: "  " })).rejects.toThrow(/must not be empty/);
	});

	it("list_states and delete_state", async () => {
		expect(await call("list_states")).toEqual({ count: 0, max: 32, states: [] });
		await call("save_state", { name: "a" });
		await call("save_state", { name: "b" });
		expect((await call("list_states")).states.map((s: { name: string }) => s.name)).toEqual(["a", "b"]);

		expect(await call("delete_state", { name: "a" })).toEqual({ result: "deleted", name: "a" });
		expect(await call("delete_state", { name: "a" })).toEqual({ result: "not_found", name: "a" });
		await expect(call("delete_state")).rejects.toThrow(/name: required/);
		expect(await call("delete_state", { all: true })).toEqual({ result: "deleted", count: 1, deleted: ["b"] });
	});
});
