import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MACHINE = "Test Machine";
const MACHINE_KEY = "test_machine";

// Every module keeps its state (db connection, dicts, ids) at module level:
// re-importing them after resetModules simulates reloading the app.
const loadApp = async () => {
	vi.resetModules();
	return {
		symbols: (await import("@/composables/useSymbols")).useSymbols(),
		formats: (await import("@/composables/useDataFormattings")).useFormatting(),
		notes: (await import("@/composables/useNotes")).useNotes(),
		store: await import("@/lib/metadataStore"),
		legacy: await import("@/lib/legacyMetadataImport"),
	};
};

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

describe("text parsers", () => {
	it("parses LABELS scripts and legacy .sym files", async () => {
		const { parseSymbolsText } = await import("@/composables/useSymbols");

		const script =
			"LABELS rom\n  $FDED COUT\n  $FC58 HOME\nEND_LABELS\n\nLABELS dos fileMgr\n  $3D6 FM\nEND_LABELS";
		expect(parseSymbolsText(script)).toEqual([
			{ ns: "rom", scope: "main", label: "COUT", addr: 0xfded, src: "" },
			{ ns: "rom", scope: "main", label: "HOME", addr: 0xfc58, src: "" },
			{ ns: "dos", scope: "fileMgr", label: "FM", addr: 0x3d6, src: "" },
		]);

		const sym = "rom:\n  COUT: number = $FDED ;print char\n'dos' [scope=fileMgr]:\n  FM: number = $03D6";
		expect(parseSymbolsText(sym)).toEqual([
			{ ns: "rom", scope: "main", label: "COUT", addr: 0xfded, src: "print char" },
			{ ns: "dos", scope: "fileMgr", label: "FM", addr: 0x3d6, src: "" },
		]);
	});

	it("parses FORMATS scripts and legacy '%% DATA' files", async () => {
		const { parseFormattingsText } = await import("@/composables/useDataFormattings");

		const script = "FORMATS\n  $2000 b 8\n  $2008 w 2\nEND_FORMATS\nFORMATS tables\n  $3000 s\nEND_FORMATS";
		expect(parseFormattingsText(script)).toEqual([
			{ address: 0x2000, type: "byte", length: 8, group: "user" },
			{ address: 0x2008, type: "word", length: 4, group: "user" },
			{ address: 0x3000, type: "string", length: 1, group: "tables" },
		]);

		const legacy = "'%% DATA: tables %%':\n  2000: byte[8]\n  2008: word[2]";
		expect(parseFormattingsText(legacy)).toEqual([
			{ address: 0x2000, type: "byte", length: 8, group: "tables" },
			{ address: 0x2008, type: "word", length: 4, group: "tables" },
		]);
	});
});

describe("symbols storage", () => {
	it("persists system and disk symbols across reloads", async () => {
		let app = await loadApp();
		await app.symbols.initSymbols(MACHINE);
		await app.symbols.addSymbol(0x300, "SYS_ENTRY");
		await app.symbols.setDiskKey("game.dsk");
		await app.symbols.addManySymbols([
			{ ns: "game", label: "START", addr: 0x800, scope: "main" },
			{ ns: "game", label: "LOOP", addr: 0x810, scope: "main" },
		]);

		app = await loadApp();
		await app.symbols.initSymbols(MACHINE);
		expect(app.symbols.getLabelForAddress(0x300, "main")).toBe("SYS_ENTRY");
		expect(app.symbols.getLabelForAddress(0x800, "main")).toBeUndefined();

		await app.symbols.setDiskKey("game.dsk");
		expect(app.symbols.getLabelForAddress(0x800, "main")).toBe("START");
		expect(app.symbols.getAddressForLabel("LOOP")).toBe(0x810);
	});

	it("updates and removes symbols by id, and persists it", async () => {
		let app = await loadApp();
		await app.symbols.initSymbols(MACHINE);
		await app.symbols.addSymbol(0x300, "A1");
		await app.symbols.addSymbol(0x310, "A2");
		const a1 = app.symbols.getSymbolForAddress(0x300, "main")!;
		const a2 = app.symbols.getSymbolForAddress(0x310, "main")!;

		await app.symbols.updateSymbol(a1.id!, 0x320, "A1_MOVED", "user", "main");
		await app.symbols.removeManySymbols(new Set([a2.id!]));

		app = await loadApp();
		await app.symbols.initSymbols(MACHINE);
		expect(app.symbols.getLabelForAddress(0x300, "main")).toBeUndefined();
		expect(app.symbols.getLabelForAddress(0x310, "main")).toBeUndefined();
		expect(app.symbols.getLabelForAddress(0x320, "main")).toBe("A1_MOVED");
	});

	it("keeps a label unique within its namespace", async () => {
		const app = await loadApp();
		await app.symbols.initSymbols(MACHINE);
		await app.symbols.addSymbol(0x300, "DUP");

		await expect(app.symbols.addSymbol(0x400, "DUP")).rejects.toThrow(/already exists/);

		// Bulk definitions (LABELS, imports) move the label instead
		await app.symbols.addManySymbols([{ ns: "user", label: "DUP", addr: 0x400, scope: "main" }]);
		expect(app.symbols.getLabelForAddress(0x300, "main")).toBeUndefined();
		expect(app.symbols.getAddressForLabel("DUP")).toBe(0x400);
	});

	it("waits for a pending disk load before mutating", async () => {
		const app = await loadApp();
		await app.symbols.initSymbols(MACHINE);
		await app.symbols.setDiskKey("game.dsk");
		await app.symbols.addSymbol(0x800, "START");

		// Not awaited, as DiskDriveControl does
		void app.symbols.setDiskKey("other.dsk");
		await app.symbols.addSymbol(0x900, "OTHER");
		await app.symbols.setDiskKey("game.dsk");

		expect(app.symbols.getLabelForAddress(0x800, "main")).toBe("START");
		expect(app.symbols.getLabelForAddress(0x900, "main")).toBeUndefined();
	});
});

describe("formattings and notes storage", () => {
	it("persists formattings and notes across reloads", async () => {
		let app = await loadApp();
		await app.formats.initFormats(MACHINE);
		await app.formats.addFormatting(0x2000, "byte", 8, "tables");
		await app.formats.addFormatting(0x2000, "word", 4, "tables"); // same address/group: replaced
		await app.notes.initNotes(MACHINE);
		await app.notes.addNote(0x2000, "main", "lookup table");

		app = await loadApp();
		await app.formats.initFormats(MACHINE);
		await app.notes.initNotes(MACHINE);
		expect(app.formats.getFormat(0x2000)).toMatchObject({ type: "word", length: 4, group: "tables" });
		expect(app.formats.findFormattings("2000")).toHaveLength(1);
		expect(app.notes.getNoteEntry(0x2000, "main")?.note).toBe("lookup table");
	});

	it("changes a rule's type in place, on its own disk and group", async () => {
		let app = await loadApp();
		await app.formats.initFormats(MACHINE);
		await app.formats.addFormatting(0xff0a, "string", 9, "rom"); // system rule
		await app.formats.setDiskKey("game.dsk");

		const rule = app.formats.getFormat(0xff0a)!;
		await app.formats.updateFormatting(rule.id!, { type: "byte" });
		expect(app.formats.getFormat(0xff0a)).toMatchObject({ type: "byte", length: 9, group: "rom", disk: "*" });
		expect(app.formats.findFormattings("FF0A")).toHaveLength(1);

		app = await loadApp();
		await app.formats.initFormats(MACHINE);
		await app.formats.setDiskKey("game.dsk");
		expect(app.formats.getFormat(0xff0a)).toMatchObject({ type: "byte", length: 9, group: "rom" });
		expect(await app.store.loadMetadata(MACHINE_KEY, "formats", "game.dsk")).toBeUndefined();

		// Removing it by id works from the disk too, and is persisted on the system disk
		await app.formats.removeManyFormattings(new Set([app.formats.getFormat(0xff0a)!.id!]));
		expect(app.formats.getFormat(0xff0a)).toBeUndefined();
		expect(await app.store.loadMetadata(MACHINE_KEY, "formats", "*")).toBeUndefined();
	});

	it("seeds the system formats only when none were stored", async () => {
		const seed = {
			0x2000: { rom: { disk: "*", address: 0x2000, type: "byte" as const, length: 2, group: "rom" } },
		};

		let app = await loadApp();
		await app.formats.initFormats(MACHINE, seed);
		await app.formats.addFormatting(0x2100, "byte", 1, "user");

		app = await loadApp();
		await app.formats.initFormats(MACHINE, seed);
		expect(app.formats.getFormat(0x2000)).toMatchObject({ group: "rom" });
		expect(app.formats.getFormat(0x2100)).toMatchObject({ group: "user" });
	});
});

describe("legacy import", () => {
	const createLegacyDb = async () => {
		const db = await openDB("vm6502_metadata", 4, {
			upgrade(db) {
				for (const kind of ["symbols", "datablocks", "notes"])
					db.createObjectStore(`${MACHINE_KEY}_${kind}`, { keyPath: "id", autoIncrement: true });
			},
		});
		await db.add(`${MACHINE_KEY}_symbols`, {
			disk: "*",
			ns: "user",
			label: "SYS",
			addr: 0x300,
			scope: "main",
			src: "",
		});
		await db.add(`${MACHINE_KEY}_symbols`, {
			disk: "game.dsk",
			ns: "game",
			label: "START",
			addr: 0x800,
			scope: "main",
			src: "",
		});
		await db.add(`${MACHINE_KEY}_symbols`, {
			disk: "game.dsk",
			ns: "game",
			label: "OLD",
			addr: 0x810,
			scope: "main",
			src: "",
		});
		await db.add(`${MACHINE_KEY}_datablocks`, {
			disk: "game.dsk",
			address: 0x2000,
			type: "byte",
			length: 8,
			group: "user",
		});
		await db.add(`${MACHINE_KEY}_notes`, { disk: "game.dsk", addr: 0x800, scope: "main", note: "entry point" });
		db.close();
	};

	it("copies all kinds and disks, keeps existing entries and leaves the legacy db untouched", async () => {
		await createLegacyDb();

		const app = await loadApp();
		await app.symbols.initSymbols(MACHINE);
		await app.symbols.setDiskKey("game.dsk");
		await app.symbols.addSymbol(0x810, "NEW", "game"); // already defined in the new storage: wins over "OLD"

		const report = await app.legacy.importLegacyMetadata();
		expect(report).toMatchObject({
			found: true,
			machines: [MACHINE_KEY],
			added: { symbols: 2, formats: 1, notes: 1 },
			skipped: 1,
		});

		const gameSymbols = await app.store.loadMetadata<{ label: string }>(MACHINE_KEY, "symbols", "game.dsk");
		expect(gameSymbols?.map((s) => s.label).sort()).toEqual(["NEW", "START"]);
		expect(await app.store.loadMetadata(MACHINE_KEY, "symbols", "*")).toEqual([
			{ ns: "user", label: "SYS", addr: 0x300, scope: "main", src: "" },
		]);
		expect(await app.store.loadMetadata(MACHINE_KEY, "formats", "game.dsk")).toEqual([
			{ address: 0x2000, type: "byte", length: 8, group: "user" },
		]);
		expect(await app.store.loadMetadata(MACHINE_KEY, "notes", "game.dsk")).toEqual([
			{ addr: 0x800, scope: "main", note: "entry point" },
		]);

		// Importing again adds nothing
		expect((await app.legacy.importLegacyMetadata()).added).toEqual({ symbols: 0, formats: 0, notes: 0 });

		const legacy = await openDB("vm6502_metadata");
		expect(legacy.version).toBe(4);
		expect(await legacy.count(`${MACHINE_KEY}_symbols`)).toBe(3);
		legacy.close();
	});

	it("reports nothing, and creates nothing, when there is no legacy db", async () => {
		const app = await loadApp();
		expect((await app.legacy.importLegacyMetadata()).found).toBe(false);
		const names = (await indexedDB.databases()).map((db) => db.name);
		expect(names).not.toContain("vm6502_metadata");
	});
});
