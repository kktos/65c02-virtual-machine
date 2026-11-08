import { beforeEach, describe, expect, it, vi } from "vitest";

// localStorage
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (k: string) => storage.get(k) ?? null,
	setItem: (k: string, v: string) => storage.set(k, v),
	removeItem: (k: string) => storage.delete(k),
});

// The library (IndexedDB)
type Rec = { type: "physical" | "url"; name: string; path: string; size: number; data?: ArrayBuffer };
const library = new Map<unknown, Rec>();
vi.mock("@/composables/useDiskStorage", () => ({
	useDiskStorage: () => ({
		loadDisk: async (key: unknown) => {
			const rec = library.get(key);
			return rec && { ...rec, key };
		},
		getAllDisks: async () => [...library].map(([key, { data: _data, ...rec }]) => ({ ...rec, key })),
		saveDisk: async (key: unknown, name: string, path: string, data: ArrayBuffer) =>
			library.set(key, { type: "physical", name, path, size: data.byteLength, data }),
		saveUrlDisk: async (key: unknown, name: string, path: string) =>
			library.set(key, { type: "url", name, path, size: 0 }),
		deleteDisk: async (key: unknown) => library.delete(key),
	}),
}));

// Metadata: records the order of disk switches and symbol additions
const events: string[] = [];
const setDiskKey = (what: string) => async (key: string) => void events.push(`${what}:${key}`);
vi.mock("@/composables/useSymbols", () => ({
	useSymbols: () => ({
		setDiskKey: setDiskKey("symbols"),
		addSymbolsFromText: async (text: string) => void events.push(`sym:${text}`),
	}),
}));
vi.mock("@/composables/useDataFormattings", () => ({ useFormatting: () => ({ setDiskKey: setDiskKey("formats") }) }));
vi.mock("@/composables/useNotes", () => ({ useNotes: () => ({ setDiskKey: setDiskKey("notes") }) }));

const { useDiskDrive } = await import("@/composables/useDiskDrive");
const drive = useDiskDrive();

const vm = { insertDisk: vi.fn(), ejectDisk: vi.fn() };
const asVm = vm as unknown as Parameters<typeof drive.eject>[0];
const bytes = (n: number) => new Uint8Array(n).buffer;

describe("useDiskDrive", () => {
	beforeEach(async () => {
		storage.clear();
		library.clear();
		await drive.eject(asVm);
		events.length = 0;
		vm.insertDisk.mockClear();
		vm.ejectDisk.mockClear();
	});

	it("inserts a library disk: slot 5, the file name for the card, metadata follows, remembered", async () => {
		library.set("game.2mg", { type: "physical", name: "My game", path: "game.2mg", size: 1024, data: bytes(1024) });
		const disk = await drive.insertFromLibrary(asVm, "game.2mg");

		expect(disk).toEqual({ key: "game.2mg", name: "My game", size: 1024, type: "physical" });
		expect(drive.inserted.value).toEqual(disk);
		expect(vm.insertDisk).toHaveBeenCalledWith(expect.any(Uint8Array), { slot: 5, name: "game.2mg" });
		expect(events).toEqual(expect.arrayContaining(["symbols:game.2mg", "formats:game.2mg", "notes:game.2mg"]));
		expect(storage.get("vm6502_active_disk_name")).toBe("game.2mg");
	});

	it("ejects: empty drive, no disk at the next startup, metadata back to no disk", async () => {
		library.set("a.po", { type: "physical", name: "a.po", path: "a.po", size: 4, data: bytes(4) });
		await drive.insertFromLibrary(asVm, "a.po");
		events.length = 0;

		await drive.eject(asVm);
		expect(vm.ejectDisk).toHaveBeenCalledWith({ slot: 5 });
		expect(drive.inserted.value).toBeNull();
		expect(storage.size).toBe(0);
		expect(events).toEqual(expect.arrayContaining(["symbols:", "formats:", "notes:"]));

		vm.insertDisk.mockClear();
		await drive.restoreLastDisk(asVm);
		expect(vm.insertDisk).not.toHaveBeenCalled();
		expect(drive.inserted.value).toBeNull();
	});

	it("puts the last disk back at startup", async () => {
		library.set("a.po", { type: "physical", name: "a.po", path: "a.po", size: 4, data: bytes(4) });
		storage.set("vm6502_active_disk_name", "a.po");
		await drive.restoreLastDisk(asVm);
		expect(drive.inserted.value?.key).toBe("a.po");
	});

	it("adds a file to the library and inserts it", async () => {
		await drive.insertFile(asVm, "new.dsk", bytes(8));
		expect(library.get("new.dsk")).toMatchObject({ type: "physical", path: "new.dsk" });
		expect(drive.inserted.value).toMatchObject({ key: "new.dsk", size: 8 });
	});

	it("URL disk: its .sym symbols go to that disk, not the previous one", async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.endsWith(".sym")
				? { ok: true, text: async () => "SYMS" }
				: { ok: true, arrayBuffer: async () => bytes(16), statusText: "" },
		);
		vi.stubGlobal("fetch", fetchMock);
		await drive.insertUrl(asVm, "https://example.com/disks/game.po?x=1");

		expect(fetchMock).toHaveBeenCalledWith("https://example.com/disks/game.sym");
		expect(events.indexOf("symbols:https://example.com/disks/game.po?x=1")).toBeLessThan(
			events.indexOf("sym:SYMS"),
		);
		expect(vm.insertDisk).toHaveBeenCalledWith(expect.any(Uint8Array), { slot: 5, name: "game.po" });
		expect(library.get("https://example.com/disks/game.po?x=1")).toMatchObject({ type: "url" });
		expect(storage.get("vm6502_active_disk_url")).toBe("https://example.com/disks/game.po?x=1");
	});

	it("unknown library disk: error, drive unchanged", async () => {
		await expect(drive.insertFromLibrary(asVm, "nope")).rejects.toThrow(/No disk 'nope'/);
		expect(vm.insertDisk).not.toHaveBeenCalled();
	});
});
