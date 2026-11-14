import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { DiskConfig } from "@/types/machine.interface";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

type Disk = { key: string | number; name: string; type: "physical" | "url"; size: number; path: string };
const library: Disk[] = [];
const inserted = shallowRef<Omit<Disk, "path"> | null>(null);
const drive = {
	inserted,
	listDisks: vi.fn(async () => library),
	listAllDisks: vi.fn(async () => library),
	insertFromLibrary: vi.fn(async (_vm: unknown, key: string | number) => {
		const { path: _path, ...disk } = library.find((d) => d.key === key)!;
		inserted.value = disk;
		return disk;
	}),
	insertFile: vi.fn(async (_vm: unknown, fileName: string, data: ArrayBuffer) => {
		const disk = { key: fileName, name: fileName, type: "physical" as const, size: data.byteLength };
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
	machineConfig: {
		name: "Apple //e",
		disk: { enabled: true, name: "SPDisk", extensions: [".po", ".2mg", ".dsk", ".hdv"] } as DiskConfig,
	},
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	readDebug: (a: number) => memory[a] ?? 0,
	writeDebug: vi.fn((a: number, v: number) => (memory[a] = v)),
	reset: vi.fn(async (_opts?: { cold?: boolean }) => vm.sharedRegisters.setUint16(REG_PC_OFFSET, 0xfa62, true)),
	typeText: vi.fn(async (_text: string) => ({ queued: 0, skipped: 0 })),
	play: vi.fn(() => (isRunning.value = true)),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));
vi.mock("@/composables/useDiskDrive", () => {
	const diskExtensions = (v: typeof vm) => v.machineConfig.disk?.extensions ?? [];
	return {
		diskExtensions,
		isDiskFor: (v: typeof vm, file: string) => diskExtensions(v).some((ext) => file.toLowerCase().endsWith(ext)),
		useDiskDrive: () => drive,
	};
});

const { findTool, HOST_FILE_KEY } = await import("@/lib/mcp/tools");
const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

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

	it("load_disk boot: a cold reset (the ROM boots the disk) and runs", async () => {
		const result = await call("load_disk", { disk: "conan.po", boot: true });
		expect(vm.reset).toHaveBeenCalledWith({ cold: true });
		expect(vm.typeText).not.toHaveBeenCalled();
		expect(vm.play).toHaveBeenCalled();
		expect(result).toMatchObject({ result: "inserted", booted: true, running: true });
	});

	it("load_disk boot paused: resets for a cold boot but stays paused on the reset vector", async () => {
		isRunning.value = false;
		vm.play.mockClear();
		const result = await call("load_disk", { disk: "conan.po", boot: true, paused: true });
		expect(vm.reset).toHaveBeenCalledWith({ cold: true });
		expect(vm.play).not.toHaveBeenCalled();
		expect(result).toMatchObject({ result: "inserted", booted: true, running: false, PC: "$FA62" });
	});

	it("load_disk boot, on a machine whose ROM doesn't boot the disk: types its bootKeys after the reset", async () => {
		const apple = vm.machineConfig;
		vm.machineConfig = {
			name: "Commodore PET 3032",
			disk: { enabled: true, name: "4040", extensions: [".d64"], bootKeys: 'LOAD"*",8\nRUN\n' },
		};
		library.push({ key: "games.d64", name: "games.d64", type: "physical", size: 174848, path: "games.d64" });
		try {
			await call("load_disk", { disk: "games.d64", boot: true, paused: true });
			expect(vm.reset).toHaveBeenCalledWith({ cold: true });
			expect(vm.typeText).toHaveBeenCalledWith('LOAD"*",8\nRUN\n');
			expect(vm.reset.mock.invocationCallOrder[0]).toBeLessThan(vm.typeText.mock.invocationCallOrder[0] as number);
			await expect(call("load_disk", { path: hostFile("conan.po", [0]) })).rejects.toThrow(/\(\.d64\)/);
		} finally {
			vm.machineConfig = apple;
		}
	});

	it("load_disk paused without boot is an error, before inserting", async () => {
		drive.insertFromLibrary.mockClear();
		await expect(call("load_disk", { disk: "conan.po", paused: true })).rejects.toThrow("paused: only with boot");
		expect(drive.insertFromLibrary).not.toHaveBeenCalled();
	});

	// What the vm6502-mcp server sends in place of the path it read.
	const hostFile = (name: string, bytes: number[]) => ({
		name,
		path: `/home/me/disks/${name}`,
		size: bytes.length,
		data: btoa(String.fromCharCode(...bytes)),
	});

	it("load_disk path: the schema marks it as a host file for the relay", () => {
		const schema = findTool("load_disk")!.inputSchema as unknown as {
			properties: Record<string, Record<string, unknown>>;
		};
		expect(schema.properties.path?.[HOST_FILE_KEY]).toBe(true);
		expect(schema.properties.disk?.[HOST_FILE_KEY]).toBeUndefined();
	});

	it("load_disk path: adds the file to the library and inserts it", async () => {
		const result = await call("load_disk", { path: hostFile("Game.DSK", [1, 2, 0xff]) });
		expect(drive.insertFile).toHaveBeenCalledWith(vm, "Game.DSK", expect.any(ArrayBuffer));
		expect(new Uint8Array(drive.insertFile.mock.calls[0]![2])).toEqual(Uint8Array.of(1, 2, 0xff));
		expect(result).toEqual({
			result: "inserted",
			disk: { key: "Game.DSK", name: "Game.DSK", type: "physical", size: 3 },
			path: "/home/me/disks/Game.DSK",
			added_to_library: true,
		});
		expect(drive.insertFromLibrary).not.toHaveBeenCalled();
	});

	it("load_disk path: says when it replaced a library disk, and can boot", async () => {
		const result = await call("load_disk", { path: hostFile("conan.po", [0]), boot: true });
		expect(result).toMatchObject({ replaced: true, booted: true, running: true });
		expect(vm.reset).toHaveBeenCalled();
	});

	it("load_disk path: errors", async () => {
		await expect(call("load_disk", {})).rejects.toThrow(/give one of them/);
		await expect(call("load_disk", { disk: "conan.po", path: hostFile("a.po", [0]) })).rejects.toThrow(
			/give one of them/,
		);
		await expect(call("load_disk", { path: "/tmp/a.po" })).rejects.toThrow(/read by the vm6502-mcp server/);
		await expect(call("load_disk", { path: hostFile("notes.txt", [0]) })).rejects.toThrow(/not a disk image/);
		expect(drive.insertFile).not.toHaveBeenCalled();
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
