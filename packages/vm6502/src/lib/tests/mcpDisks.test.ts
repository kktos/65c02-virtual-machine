import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

type Disk = { key: string | number; name: string; type: "physical" | "url"; size: number; path: string };
const library: Disk[] = [];
const inserted = shallowRef<Omit<Disk, "path"> | null>(null);
const drive = {
	inserted,
	listDisks: vi.fn(async () => library),
	insertFromLibrary: vi.fn(async (_vm: unknown, key: string | number) => {
		const { path: _path, ...disk } = library.find((d) => d.key === key)!;
		inserted.value = disk;
		return disk;
	}),
	eject: vi.fn(async () => {
		inserted.value = null;
	}),
};

const isRunning = ref(false);
const memory = new Uint8Array(0x10000);
const vm = {
	ready: Promise.resolve(),
	machineConfig: { name: "Apple //e", disk: { enabled: true, name: "SPDisk" } },
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	readDebug: (a: number) => memory[a] ?? 0,
	writeDebug: vi.fn((a: number, v: number) => (memory[a] = v)),
	reset: vi.fn(async () => vm.sharedRegisters.setUint16(REG_PC_OFFSET, 0xfa62, true)),
	play: vi.fn(() => (isRunning.value = true)),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));
vi.mock("@/composables/useDiskDrive", () => ({ useDiskDrive: () => drive }));

const { findTool } = await import("@/lib/mcp/tools");
const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r));

describe("disk tools", () => {
	beforeEach(() => {
		library.length = 0;
		library.push(
			{ key: "conan.po", name: "Conan", type: "physical", size: 143360, path: "conan.po" },
			{ key: "work.2mg", name: "work disk", type: "physical", size: 819264, path: "work.2mg" },
			{ key: "https://x.org/d/game.po", name: "game.po", type: "url", size: 0, path: "https://x.org/d/game.po" },
		);
		inserted.value = null;
		isRunning.value = false;
		vi.clearAllMocks();
	});

	it("list_disks: the library and what's in the drive", async () => {
		inserted.value = { key: "conan.po", name: "Conan", type: "physical", size: 143360 };
		const result = await call("list_disks");
		expect(result.in_drive).toEqual({ key: "conan.po", name: "Conan", type: "physical", size: 143360 });
		expect(result.count).toBe(3);
		expect(result.disks[0]).toEqual({
			key: "conan.po",
			name: "Conan",
			type: "physical",
			size: 143360,
			in_drive: true,
		});
		expect(result.disks[1]).not.toHaveProperty("in_drive");
		expect(result.disks[2]).toEqual({ key: "https://x.org/d/game.po", name: "game.po", type: "url", size: 0 });
	});

	it("list_disks: an inserted URL disk has its fetched size in the library too", async () => {
		inserted.value = { key: "https://x.org/d/game.po", name: "game.po", type: "url", size: 143360 };
		const result = await call("list_disks");
		expect(result.in_drive.size).toBe(143360);
		expect(result.disks[2]).toEqual({
			key: "https://x.org/d/game.po",
			name: "game.po",
			type: "url",
			size: 143360,
			in_drive: true,
		});
	});

	it("list_disks: empty drive", async () => {
		expect((await call("list_disks")).in_drive).toBeNull();
	});

	it("load_disk finds a disk by key, by name, or by name ignoring case", async () => {
		expect((await call("load_disk", { disk: "work.2mg" })).disk.key).toBe("work.2mg");
		expect((await call("load_disk", { disk: "Conan" })).disk.key).toBe("conan.po");
		expect((await call("load_disk", { disk: "WORK DISK" })).disk.key).toBe("work.2mg");
		expect(drive.insertFromLibrary).toHaveBeenLastCalledWith(vm, "work.2mg");
		expect(vm.reset).not.toHaveBeenCalled();
	});

	it("load_disk: unknown or ambiguous names are errors", async () => {
		await expect(call("load_disk", { disk: "nope" })).rejects.toThrow(/no 'nope' in the library/);
		library.push({ key: "conan2.po", name: "Conan", type: "physical", size: 1, path: "conan2.po" });
		await expect(call("load_disk", { disk: "Conan" })).rejects.toThrow(
			/2 disks named 'Conan'.*conan\.po, conan2\.po/,
		);
		expect(drive.insertFromLibrary).not.toHaveBeenCalled();
	});

	it("load_disk boot: invalidates the power-up byte, resets and runs", async () => {
		memory[0x3f3] = 0xe0; // SOFTEV+1; valid PWREDUP would be $E0 ^ $A5 = $45
		memory[0x3f4] = 0x45;
		const result = await call("load_disk", { disk: "conan.po", boot: true });
		expect(memory[0x3f4]).not.toBe(0xe0 ^ 0xa5);
		expect(vm.reset).toHaveBeenCalled();
		expect(vm.play).toHaveBeenCalled();
		expect(result).toMatchObject({ result: "inserted", booted: true, running: true });
	});

	it("load_disk refuses on a machine without a drive", async () => {
		const disk = vm.machineConfig.disk;
		(vm.machineConfig as { disk?: unknown }).disk = undefined;
		await expect(call("load_disk", { disk: "conan.po" })).rejects.toThrow(/no disk drive/);
		vm.machineConfig.disk = disk;
	});

	it("eject_disk: ejects, or says the drive was already empty", async () => {
		expect(await call("eject_disk")).toEqual({ result: "already_empty" });
		expect(drive.eject).not.toHaveBeenCalled();
		inserted.value = { key: "conan.po", name: "Conan", type: "physical", size: 143360 };
		expect(await call("eject_disk")).toMatchObject({ result: "ejected", disk: { key: "conan.po" } });
		expect(drive.eject).toHaveBeenCalled();
	});
});
