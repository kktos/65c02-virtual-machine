import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { useDiskStorage } from "@/composables/useDiskStorage";

const bytes = (n: number) => new Uint8Array(n).buffer;

/** A library as v1 stored it: one store, the bytes in each record; old records have no type / path. */
const seedV1 = (records: [IDBValidKey, Record<string, unknown>][]) =>
	new Promise<void>((resolve, reject) => {
		const request = indexedDB.open("vm6502_storage", 1);
		request.onupgradeneeded = () => request.result.createObjectStore("disks");
		request.onsuccess = () => {
			const db = request.result;
			const tx = db.transaction("disks", "readwrite");
			for (const [key, rec] of records) tx.objectStore("disks").put(rec, key);
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = () => reject(tx.error);
		};
		request.onerror = () => reject(request.error);
	});

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

describe("useDiskStorage", () => {
	it("lists a v1 library, old records included, without the bytes", async () => {
		await seedV1([
			["a.po", { type: "physical", name: "A", path: "a.po", size: 4, data: bytes(4) }],
			["old.dsk", { name: "old.dsk", size: 8, data: bytes(8) }],
			["https://x.org/b.dsk", { type: "url", name: "b.dsk", url: "https://x.org/b.dsk", size: 0 }],
		]);
		const { getAllDisks, loadDisk } = useDiskStorage();
		const disks = await getAllDisks();
		expect(disks).toEqual([
			{ key: "a.po", type: "physical", name: "A", path: "a.po", size: 4 },
			{ key: "https://x.org/b.dsk", type: "url", name: "b.dsk", path: "https://x.org/b.dsk", size: 0 },
			{ key: "old.dsk", type: "physical", name: "old.dsk", path: "old.dsk", size: 8 },
		]);
		expect(disks.some((d) => "data" in d)).toBe(false);
		// the disk itself is still whole
		expect(await loadDisk("a.po")).toMatchObject({ data: bytes(4) });
	});

	it("keeps the listing in step: save, rename, new bytes, delete", async () => {
		const { saveDisk, saveUrlDisk, renameDisk, updateDiskData, deleteDisk, getAllDisks } = useDiskStorage();
		await saveDisk("a.po", "a.po", "a.po", bytes(4));
		await saveUrlDisk("https://x.org/b.dsk", "b.dsk", "https://x.org/b.dsk");
		await renameDisk("a.po", "Game");
		await updateDiskData("a.po", bytes(16));
		expect(await getAllDisks()).toEqual([
			{ key: "a.po", type: "physical", name: "Game", path: "a.po", size: 16 },
			{ key: "https://x.org/b.dsk", type: "url", name: "b.dsk", path: "https://x.org/b.dsk", size: 0 },
		]);

		await deleteDisk("a.po");
		expect((await getAllDisks()).map((d) => d.key)).toEqual(["https://x.org/b.dsk"]);
		await expect(renameDisk("a.po", "x")).rejects.toThrow("Disk not found");
	});

	it("remembers when a disk was used and whether it is pinned, across a new save of it", async () => {
		const { saveDisk, touchDisk, setDiskPinned, getAllDisks } = useDiskStorage();
		await saveDisk("a.po", "a.po", "a.po", bytes(4));
		await touchDisk("a.po");
		await setDiskPinned("a.po", true);
		await touchDisk("nope.po"); // not in the library: nothing

		const [before] = await getAllDisks();
		expect(before.pinned).toBe(true);
		expect(before.lastUsed).toBeGreaterThan(0);

		await saveDisk("a.po", "a.po", "a.po", bytes(8)); // the same file added again
		expect(await getAllDisks()).toEqual([{ ...before, size: 8 }]);

		await setDiskPinned("a.po", false);
		expect((await getAllDisks())[0].pinned).toBe(false);
	});
});
