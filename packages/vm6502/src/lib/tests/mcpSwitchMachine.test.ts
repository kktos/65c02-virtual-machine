import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { MachineConfig } from "@/types/machine.interface";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const machines = [
	{ name: "KlausTest" },
	{ name: "Apple //e", disk: { enabled: true, name: "SPDisk", extensions: [".po", ".2mg", ".dsk", ".hdv"] } },
	{ name: "Commodore PET 3032", disk: { enabled: true, name: "4040", extensions: [".d64"] } },
] as MachineConfig[];

const makeVm = (machineConfig: MachineConfig, ready: Promise<void> = Promise.resolve()) => ({
	ready,
	machineConfig,
	sharedRegisters: new DataView(new ArrayBuffer(64)),
});

const isRunning = ref(false);
const vm = shallowRef(makeVm(machines[1]!));
let failNextStart: Error | undefined;
const loadMachine = vi.fn(async (config: MachineConfig) => {
	const ready = failNextStart ? Promise.reject(failNextStart) : Promise.resolve();
	ready.catch(() => undefined);
	failNextStart = undefined;
	vm.value = makeVm(config, ready);
});
const inserted = shallowRef<{ key: string; name: string; type: "physical"; size: number } | null>(null);

vi.mock("@/machines", () => ({ availableMachines: machines }));
vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm, isRunning, loadMachine }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));
vi.mock("@/composables/useDiskDrive", () => ({
	diskExtensions: (v: { machineConfig: MachineConfig }) => v.machineConfig.disk?.extensions ?? [],
	isDiskFor: () => false,
	useDiskDrive: () => ({ inserted }),
}));

const { findTool } = await import("@/lib/mcp/tools");
const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

describe("switch_machine", () => {
	beforeEach(() => {
		vm.value = makeVm(machines[1]!);
		inserted.value = null;
		failNextStart = undefined;
		vi.clearAllMocks();
	});

	it("lists the machines in its description", () => {
		expect(findTool("switch_machine")!.description).toContain("KlausTest, Apple //e, Commodore PET 3032");
	});

	it("switches by the exact name, any case and punctuation", async () => {
		const result = await call("switch_machine", { machine: "commodore pet-3032" });
		expect(loadMachine).toHaveBeenCalledWith(machines[2]);
		expect(result).toMatchObject({
			result: "switched",
			machine: "Commodore PET 3032",
			previous: "Apple //e",
			drive: { takes: [".d64"], in_drive: null },
			running: false,
		});
	});

	it("switches by a part only one machine has", async () => {
		await call("switch_machine", { machine: "PET" });
		expect(loadMachine).toHaveBeenCalledWith(machines[2]);
	});

	it("reports the disk the drive got back", async () => {
		loadMachine.mockImplementationOnce(async (config: MachineConfig) => {
			vm.value = makeVm(config);
			inserted.value = { key: "ladybug.d64", name: "ladybug.d64", type: "physical", size: 174848 };
		});
		const result = await call("switch_machine", { machine: "pet" });
		expect(result.drive.in_drive).toEqual({
			key: "ladybug.d64",
			name: "ladybug.d64",
			type: "physical",
			size: 174848,
		});
	});

	it("no drive: drive is null", async () => {
		const result = await call("switch_machine", { machine: "klaus" });
		expect(result).toMatchObject({ machine: "KlausTest", drive: null });
	});

	it("the current machine: already_loaded, unless restart", async () => {
		expect(await call("switch_machine", { machine: "apple" })).toEqual({
			result: "already_loaded",
			machine: "Apple //e",
		});
		expect(loadMachine).not.toHaveBeenCalled();

		const result = await call("switch_machine", { machine: "apple", restart: true });
		expect(loadMachine).toHaveBeenCalledWith(machines[1]);
		expect(result.result).toBe("restarted");
		expect(result.previous).toBeUndefined();
	});

	it("an unknown or ambiguous name lists the machines", async () => {
		await expect(call("switch_machine", { machine: "c64" })).rejects.toThrow(
			'no machine "c64" (KlausTest, Apple //e, Commodore PET 3032)',
		);
		await expect(call("switch_machine", { machine: "e" })).rejects.toThrow('"e" is ambiguous');
		await expect(call("switch_machine", { machine: " " })).rejects.toThrow("a name expected");
		expect(loadMachine).not.toHaveBeenCalled();
	});

	it("a machine that can't start (a missing ROM): the error", async () => {
		failNextStart = new Error("roms/pet/basic-2.bin: not found");
		await expect(call("switch_machine", { machine: "pet" })).rejects.toThrow("basic-2.bin: not found");
	});
});
