import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { MachineConfig, SlotLayout } from "@/types/machine.interface";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => store.set(k, v),
});

const apple = {
	name: "Apple //e",
	slots: {
		count: 7,
		cards: [
			{ id: "mouse", label: "AppleMouse", slots: [1, 2, 4, 5, 6, 7] },
			{ id: "mockingboard", label: "Mockingboard", slots: [1, 2, 4, 5, 6, 7] },
		],
		builtin: { 3: "80-column card" },
		default: { 4: "mouse", 7: "mockingboard" },
	},
} as unknown as MachineConfig;
const pet = { name: "Commodore PET 3032" } as MachineConfig;

const makeVm = (machineConfig: MachineConfig, slots?: SlotLayout) => ({
	ready: Promise.resolve(),
	machineConfig,
	busOptions: { slots },
	sharedRegisters: new DataView(new ArrayBuffer(64)),
});

const isRunning = ref(false);
const vm = shallowRef(makeVm(apple));
// As useMachine's: the current machine again, built with the user's layout
const loadMachine = vi.fn(async () => {
	const { slotLayoutFor } = await import("@/composables/useSlots");
	vm.value = makeVm(vm.value.machineConfig, slotLayoutFor(vm.value.machineConfig));
});

vi.mock("@/machines", () => ({ availableMachines: [apple, pet] }));
vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm, isRunning, loadMachine }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));
vi.mock("@/composables/useDiskDrive", () => ({
	diskExtensions: () => [],
	isDiskFor: () => false,
	useDiskDrive: () => ({}),
}));

const { findTool } = await import("@/lib/mcp/tools");
const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

describe("get_slots / set_slots", () => {
	beforeEach(() => {
		store.clear();
		vm.value = makeVm(apple, { 4: "mouse", 7: "mockingboard" });
		vi.clearAllMocks();
	});

	it("get_slots: count 0 on a machine without slots", async () => {
		vm.value = makeVm(pet);
		expect(await call("get_slots")).toEqual({ machine: "Commodore PET 3032", count: 0 });
	});

	it("get_slots: each slot, its card, and the cards the machine takes", async () => {
		const result = await call("get_slots");
		expect(result).toMatchObject({ machine: "Apple //e", count: 7, is_default: true });
		expect(result.slots).toHaveLength(7);
		expect(result.slots[0]).toEqual({ slot: 1, card: null });
		expect(result.slots[2]).toEqual({ slot: 3, card: null, builtin: "80-column card" });
		expect(result.slots[3]).toEqual({ slot: 4, card: "mouse", label: "AppleMouse" });
		expect(result.cards[1]).toEqual({ id: "mockingboard", label: "Mockingboard", slots: [1, 2, 4, 5, 6, 7] });
	});

	it("set_slots: swaps the cards, saves them, power-cycles", async () => {
		const result = await call("set_slots", { slots: { "4": "mockingboard", "7": "mouse" } });
		expect(loadMachine).toHaveBeenCalledOnce();
		expect(result).toMatchObject({ result: "restarted", is_default: false, running: false });
		expect(result.slots[3]).toMatchObject({ slot: 4, card: "mockingboard" });
		expect(result.slots[6]).toMatchObject({ slot: 7, card: "mouse" });
		expect(JSON.parse(store.get("vm6502_slots")!)).toEqual({ "Apple //e": { 4: "mockingboard", 7: "mouse" } });
	});

	it("set_slots: null empties a slot, the others kept", async () => {
		const result = await call("set_slots", { slots: { 7: null } });
		expect(result.slots.filter((s: { card: string | null }) => s.card)).toEqual([
			{ slot: 4, card: "mouse", label: "AppleMouse" },
		]);
	});

	it("set_slots: default alone goes back to the default and forgets the user's", async () => {
		vm.value = makeVm(apple, { 1: "mouse" });
		store.set("vm6502_slots", JSON.stringify({ "Apple //e": { 1: "mouse" } }));
		const result = await call("set_slots", { default: true });
		expect(result).toMatchObject({ result: "restarted", is_default: true });
		expect(JSON.parse(store.get("vm6502_slots")!)).toEqual({});
	});

	it("set_slots: no change, no power cycle", async () => {
		const result = await call("set_slots", { slots: { 4: "mouse" } });
		expect(result.result).toBe("unchanged");
		expect(loadMachine).not.toHaveBeenCalled();
	});

	it("set_slots: refuses what the machine can't take, nothing changed", async () => {
		await expect(call("set_slots", { slots: { 3: "mouse" } })).rejects.toThrow(/slot 1, 2, 4, 5, 6, 7 only/);
		await expect(call("set_slots", { slots: { 2: "printer" } })).rejects.toThrow(/no card "printer"/);
		await expect(call("set_slots", { slots: "4=mouse" })).rejects.toThrow(/an object expected/);
		vm.value = makeVm(pet);
		await expect(call("set_slots", { slots: { 4: "mouse" } })).rejects.toThrow(/has no slots/);
		expect(loadMachine).not.toHaveBeenCalled();
		expect(store.size).toBe(0);
	});
});
