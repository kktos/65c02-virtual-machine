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
		renameDisk: async (key: unknown, name: string) => {
			const rec = library.get(key);
			if (rec) rec.name = name;
		},
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

const APPLE_DISKS = [".po", ".2mg", ".dsk", ".hdv"];
const vm = {
	insertDisk: vi.fn(),
	ejectDisk: vi.fn(),
	machineConfig: { name: "Apple //e", disk: { enabled: true, extensions: APPLE_DISKS } },
};
const asVm = vm as unknown as Parameters<typeof drive.eject>[0];
/** Another machine with its own drive */
const pet = {
	insertDisk: vi.fn(),
	ejectDisk: vi.fn(),
	machineConfig: { name: "PET", disk: { enabled: true, extensions: [".d64"] } },
};
const asPet = pet as unknown as Parameters<typeof drive.eject>[0];
const APPLE_KEY = "vm6502_active_disk_name:Apple //e";
const APPLE_URL_KEY = "vm6502_active_disk_url:Apple //e";
const bytes = (n: number) => new Uint8Array(n).buffer;

describe("useDiskDrive", () => {
	beforeEach(async () => {
		storage.clear();
		library.clear();
		await drive.eject(asVm);
		events.length = 0;
		vm.insertDisk.mockClear();
		vm.ejectDisk.mockClear();
		pet.insertDisk.mockClear();
	});

	it("inserts a library disk: the file name for the drive, metadata follows, remembered for the machine", async () => {
		library.set("game.2mg", { type: "physical", name: "My game", path: "game.2mg", size: 1024, data: bytes(1024) });
		const disk = await drive.insertFromLibrary(asVm, "game.2mg");

		expect(disk).toEqual({ key: "game.2mg", name: "My game", size: 1024, type: "physical" });
		expect(drive.inserted.value).toEqual(disk);
		expect(vm.insertDisk).toHaveBeenCalledWith(expect.any(Uint8Array), { name: "game.2mg" });
		expect(events).toEqual(expect.arrayContaining(["symbols:game.2mg", "formats:game.2mg", "notes:game.2mg"]));
		expect(storage.get(APPLE_KEY)).toBe("game.2mg");
	});

	it("ejects: empty drive, no disk at the next startup, metadata back to no disk", async () => {
		library.set("a.po", { type: "physical", name: "a.po", path: "a.po", size: 4, data: bytes(4) });
		await drive.insertFromLibrary(asVm, "a.po");
		events.length = 0;

		await drive.eject(asVm);
		expect(vm.ejectDisk).toHaveBeenCalledWith();
		expect(drive.inserted.value).toBeNull();
		expect(storage.size).toBe(0);
		expect(events).toEqual(expect.arrayContaining(["symbols:*", "formats:*", "notes:*"]));

		vm.insertDisk.mockClear();
		await drive.restoreLastDisk(asVm);
		expect(vm.insertDisk).not.toHaveBeenCalled();
		expect(drive.inserted.value).toBeNull();
	});

	it("puts the last disk back at startup", async () => {
		library.set("a.po", { type: "physical", name: "a.po", path: "a.po", size: 4, data: bytes(4) });
		storage.set(APPLE_KEY, "a.po");
		await drive.restoreLastDisk(asVm);
		expect(drive.inserted.value?.key).toBe("a.po");
	});

	it("takes the disk remembered before the machines had their own, if it's one for the machine", async () => {
		library.set("a.po", { type: "physical", name: "a.po", path: "a.po", size: 4, data: bytes(4) });
		storage.set("vm6502_active_disk_name", "a.po");
		await drive.restoreLastDisk(asPet);
		expect(drive.inserted.value).toBeNull(); // not the PET's
		expect(storage.get("vm6502_active_disk_name")).toBe("a.po");

		await drive.restoreLastDisk(asVm);
		expect(drive.inserted.value?.key).toBe("a.po");
		expect(storage.has("vm6502_active_disk_name")).toBe(false); // now the Apple's
		expect(storage.get(APPLE_KEY)).toBe("a.po");
	});

	it("each machine has its own drive: another machine starts empty, then gets its own disk back", async () => {
		library.set("a.po", { type: "physical", name: "a.po", path: "a.po", size: 4, data: bytes(4) });
		library.set("games.d64", { type: "physical", name: "games", path: "games.d64", size: 8, data: bytes(8) });
		await drive.insertFromLibrary(asVm, "a.po");
		events.length = 0;

		await drive.restoreLastDisk(asPet);
		expect(drive.inserted.value).toBeNull();
		expect(events).toEqual(expect.arrayContaining(["symbols:*"])); // not the Apple disk's labels
		await drive.insertFromLibrary(asPet, "games.d64");
		expect(pet.insertDisk).toHaveBeenCalledWith(expect.any(Uint8Array), { name: "games.d64" });

		await drive.restoreLastDisk(asVm);
		expect(drive.inserted.value?.key).toBe("a.po");
		await drive.restoreLastDisk(asPet);
		expect(drive.inserted.value?.key).toBe("games.d64");
	});

	it("lists, and inserts, only the images the machine's drive takes", async () => {
		library.set("a.po", { type: "physical", name: "a.po", path: "a.po", size: 4, data: bytes(4) });
		library.set("games.d64", { type: "physical", name: "games", path: "games.d64", size: 8, data: bytes(8) });
		library.set("https://x.org/b.D64?raw=1", {
			type: "url",
			name: "b",
			path: "https://x.org/b.D64?raw=1",
			size: 0,
		});
		expect((await drive.listDisks(asVm)).map((d) => d.key)).toEqual(["a.po"]);
		expect((await drive.listDisks(asPet)).map((d) => d.key)).toEqual(["games.d64", "https://x.org/b.D64?raw=1"]);
		expect((await drive.listAllDisks()).length).toBe(3);

		await expect(drive.insertFromLibrary(asPet, "a.po")).rejects.toThrow("a.po isn't a disk for the PET (.d64)");
		await expect(drive.insertFile(asPet, "x.dsk", bytes(4))).rejects.toThrow("x.dsk isn't a disk for the PET");
		await expect(drive.insertUrl(asPet, "https://x.org/c.po")).rejects.toThrow("c.po isn't a disk for the PET");
		expect(pet.insertDisk).not.toHaveBeenCalled();
		expect(library.has("x.dsk")).toBe(false);
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
		expect(vm.insertDisk).toHaveBeenCalledWith(expect.any(Uint8Array), { name: "game.po" });
		expect(library.get("https://example.com/disks/game.po?x=1")).toMatchObject({ type: "url" });
		expect(storage.get(APPLE_URL_KEY)).toBe("https://example.com/disks/game.po?x=1");
	});

	it("URL disk: its name is unescaped (%20 → space)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes(16), statusText: "" })),
		);
		const url = "https://example.com/Apple%20DOS%203.3%20January%201983.dsk";
		await drive.insertUrl(asVm, url);

		expect(library.get(url)).toMatchObject({ type: "url", name: "Apple DOS 3.3 January 1983.dsk" });
		expect(drive.inserted.value).toMatchObject({ key: url, name: "Apple DOS 3.3 January 1983.dsk" });
	});

	it("URL disk: a malformed escape keeps the name as written", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes(16), statusText: "" })),
		);
		await drive.insertUrl(asVm, "https://example.com/100%.dsk");
		expect(drive.inserted.value).toMatchObject({ name: "100%.dsk" });
	});

	it("unknown library disk: error, drive unchanged", async () => {
		await expect(drive.insertFromLibrary(asVm, "nope")).rejects.toThrow(/No disk 'nope'/);
		expect(vm.insertDisk).not.toHaveBeenCalled();
	});

	it("renaming the inserted disk renames it in the drive too", async () => {
		library.set("a.po", { type: "physical", name: "a.po", path: "a.po", size: 4, data: bytes(4) });
		library.set("b.po", { type: "physical", name: "b.po", path: "b.po", size: 4, data: bytes(4) });
		await drive.insertFromLibrary(asVm, "a.po");

		await drive.rename("b.po", "Other");
		expect(drive.inserted.value?.name).toBe("a.po");

		await drive.rename("a.po", "My disk");
		expect(library.get("a.po")?.name).toBe("My disk");
		expect(drive.inserted.value).toMatchObject({ key: "a.po", name: "My disk" });
	});

	it("a renamed URL disk keeps its name when put back at startup", async () => {
		const url = "https://example.com/game.po";
		vi.stubGlobal("fetch", async (u: string) =>
			u.endsWith(".sym") ? { ok: false } : { ok: true, arrayBuffer: async () => bytes(16), statusText: "" },
		);
		library.set(url, { type: "url", name: "My game", path: url, size: 0 });
		storage.set(APPLE_URL_KEY, url);

		await drive.restoreLastDisk(asVm);
		expect(drive.inserted.value).toMatchObject({ key: url, name: "My game" });
		expect(vm.insertDisk).toHaveBeenCalledWith(expect.any(Uint8Array), { name: "game.po" });
	});
});
