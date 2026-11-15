import type { DataBlock } from "@/composables/useDataFormattings";
import type { SymbolDict } from "./useSymbols";
import { ref } from "vue";

/** What the library lists for a disk: no bytes. `lastUsed` (ms) and `pinned` order the library. */
type DiskListing = { key: IDBValidKey; name: string; path: string; size: number; lastUsed?: number; pinned?: boolean };

export type StoredDisk =
	| (DiskListing & {
			type: "physical";
			data: ArrayBuffer;
			symbols?: SymbolDict;
			formatting?: Record<string, DataBlock>;
	  })
	| (DiskListing & {
			type: "url";
			symbols?: SymbolDict;
			formatting?: Record<string, DataBlock>;
	  });

let lastLoadedDisk = ref<StoredDisk | null>(null);

const DB_NAME = "vm6502_storage";
/** The disks, whole (bytes, labels, formats), by key */
const STORE_NAME = "disks";
/** v2: the same keys, without the bytes: what listing the library reads (a hard disk image can be 32 MB) */
const META_STORE = "disk_meta";
const DB_VERSION = 2;

type DiskMeta = Omit<DiskListing, "key"> & { type: StoredDisk["type"] };

/** A disk record's listing; old records have no type, or their path as `url` / `filepath`. */
const metaOf = (rec: Record<string, any>): DiskMeta => {
	const type = rec.type || "physical";
	const path = rec.path || (type === "url" ? rec.url : rec.filepath || rec.name);
	return { type, name: rec.name, path, size: rec.size ?? rec.data?.byteLength ?? 0 };
};

/** Writes a disk's listing, keeping when it was last used and whether it is pinned. */
const putMeta = (meta: IDBObjectStore, key: IDBValidKey, fields: Partial<DiskMeta>) => {
	const get = meta.get(key);
	get.onsuccess = () => meta.put({ ...get.result, ...fields }, key);
};

const getDb = (): Promise<IDBDatabase> => {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const db = request.result;
			// Another tab upgrading the database: let it
			db.onversionchange = () => db.close();
			resolve(db);
		};
		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			const tx = request.transaction as IDBTransaction;
			if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
			if (!db.objectStoreNames.contains(META_STORE)) {
				const meta = db.createObjectStore(META_STORE);
				// The listing of each disk already in the library
				const cursor = tx.objectStore(STORE_NAME).openCursor();
				cursor.onsuccess = () => {
					const c = cursor.result;
					if (!c) return;
					meta.put(metaOf(c.value), c.key);
					c.continue();
				};
			}
		};
	});
};

/** A read-write transaction on the disks and their listings; resolves once committed. */
const write = async (body: (disks: IDBObjectStore, meta: IDBObjectStore, tx: IDBTransaction) => void) => {
	const db = await getDb();
	return new Promise<void>((resolve, reject) => {
		const tx = db.transaction([STORE_NAME, META_STORE], "readwrite");
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error("Disk library: transaction aborted"));
		body(tx.objectStore(STORE_NAME), tx.objectStore(META_STORE), tx);
	});
};

export function useDiskStorage() {
	const save = (key: IDBValidKey, rec: Record<string, unknown>) =>
		write((disks, meta) => {
			disks.put(rec, key);
			putMeta(meta, key, metaOf(rec));
		});

	const saveDisk = async (key: IDBValidKey, name: string, path: string, data: ArrayBuffer) =>
		save(key, { type: "physical", name, path, size: data.byteLength, data, symbols: {}, formatting: {} });

	const saveUrlDisk = async (key: IDBValidKey, name: string, path: string) =>
		save(key, { type: "url", name, path, size: 0, symbols: {}, formatting: {} });

	const loadDisk = async (key: IDBValidKey): Promise<StoredDisk | undefined> => {
		const db = await getDb();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(key);
			request.onsuccess = () => {
				const result = request.result;
				if (result) {
					// data migration for old records
					if (!result.type) result.type = "physical";
					if (!result.path) {
						if (result.type === "url") result.path = result.url;
						else result.path = result.filepath || result.name;
					}
				}
				lastLoadedDisk.value = result;
				resolve(result as StoredDisk);
			};
			request.onerror = () => reject(request.error);
		});
	};

	/** The library, without the bytes: from the listings. */
	const getAllDisks = async () => {
		const db = await getDb();
		return new Promise<StoredDisk[]>((resolve, reject) => {
			const request = db.transaction(META_STORE, "readonly").objectStore(META_STORE).openCursor();
			const results: StoredDisk[] = [];
			request.onsuccess = () => {
				const cursor = request.result;
				if (!cursor) return resolve(results);
				results.push({ ...cursor.value, key: cursor.key });
				cursor.continue();
			};
			request.onerror = () => reject(request.error);
		});
	};

	const deleteDisk = async (key: IDBValidKey) =>
		write((disks, meta) => {
			disks.delete(key);
			meta.delete(key);
		});

	const updateDisk = async (key: IDBValidKey, newdata: Partial<StoredDisk>) => {
		let notFound = false;
		try {
			await write((disks, meta, tx) => {
				const request = disks.get(key);
				request.onsuccess = () => {
					const data = request.result;
					if (!data) {
						notFound = true;
						return tx.abort();
					}
					for (const prop in newdata) {
						const value = (newdata as Record<string, unknown>)[prop];
						if (
							typeof value === "object" &&
							value !== null &&
							!(value instanceof ArrayBuffer) &&
							!ArrayBuffer.isView(value)
						) {
							// Deep clone to strip Vue Proxies, ensuring a plain object is stored
							data[prop] = JSON.parse(JSON.stringify(value));
						} else {
							data[prop] = value;
						}
					}
					disks.put(data, key);
					putMeta(meta, key, metaOf(data));
				};
			});
		} catch (e) {
			if (notFound) throw new Error("Disk not found");
			console.error("Failed to update disk", key, newdata);
			throw e;
		}
	};

	/** Fields of a disk's listing only (when it was last used, pinned); none if the disk isn't in the library. */
	const updateMeta = (key: IDBValidKey, fields: Pick<DiskMeta, "lastUsed" | "pinned">) =>
		write((_disks, meta) => {
			const get = meta.get(key);
			get.onsuccess = () => {
				if (get.result) meta.put({ ...get.result, ...fields }, key);
			};
		});

	/** The disk was just inserted: it goes up the library's recent disks. */
	const touchDisk = async (key: IDBValidKey) => updateMeta(key, { lastUsed: Date.now() });

	/** Pinned disks stay at the top of the library. */
	const setDiskPinned = async (key: IDBValidKey, pinned: boolean) => updateMeta(key, { pinned });

	const renameDisk = async (key: IDBValidKey, newName: string) => {
		return updateDisk(key, { name: newName });
	};

	/** New bytes for a library disk (files copied to it); its labels, formats and notes kept */
	const updateDiskData = async (key: IDBValidKey, data: ArrayBuffer) => {
		return updateDisk(key, { data, size: data.byteLength } as Partial<StoredDisk>);
	};

	const updateDiskFormatting = async (key: IDBValidKey, formatting: Record<string, DataBlock>) => {
		return updateDisk(key, { formatting });
	};

	return {
		saveDisk,
		saveUrlDisk,
		loadDisk,
		getAllDisks,
		deleteDisk,
		renameDisk,
		touchDisk,
		setDiskPinned,
		updateDiskData,
		updateDiskFormatting,
		lastLoadedDisk,
	};
}
