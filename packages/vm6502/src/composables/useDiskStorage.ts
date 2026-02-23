import type { DataBlock } from "@/composables/useDataFormattings";
import type { SymbolDict } from "./useSymbols";
import { ref } from "vue";

export type StoredDisk =
	| {
			type: "physical";
			key: IDBValidKey;
			name: string;
			path: string;
			size: number;
			data: ArrayBuffer;
			symbols?: SymbolDict;
			formatting?: Record<string, DataBlock>;
	  }
	| {
			type: "url";
			key: IDBValidKey;
			name: string;
			path: string;
			size: number;
			symbols?: SymbolDict;
			formatting?: Record<string, DataBlock>;
	  };

let lastLoadedDisk = ref<StoredDisk | null>(null);

export function useDiskStorage() {
	const DB_NAME = "vm6502_storage";
	const STORE_NAME = "disks";
	const DB_VERSION = 1;

	const getDb = (): Promise<IDBDatabase> => {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			};
		});
	};

	const saveDisk = async (key: IDBValidKey, name: string, path: string, data: ArrayBuffer) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put(
				{
					type: "physical",
					name,
					path,
					size: data.byteLength,
					data,
					symbols: {},
					formatting: {},
				},
				key,
			);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	};

	const saveUrlDisk = async (key: IDBValidKey, name: string, path: string) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put({ type: "url", name, path, size: 0, symbols: {}, formatting: {} }, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	};

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

	const getAllDisks = async () => {
		const db = await getDb();
		return new Promise<StoredDisk[]>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.openCursor();
			const results: StoredDisk[] = [];

			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
				if (cursor) {
					const value = cursor.value;
					const base = { key: cursor.key, name: value.name, size: value.size };
					let path = value.path;
					const type = value.type || "physical";

					if (!path) {
						if (type === "url") path = value.url;
						else path = value.filepath || value.name;
					}

					results.push({ ...base, type, path });
					cursor.continue();
				} else {
					resolve(results);
				}
			};
			request.onerror = () => reject(request.error);
		});
	};

	const deleteDisk = async (key: IDBValidKey) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.delete(key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	};

	const updateDisk = async (key: IDBValidKey, newdata: Partial<StoredDisk>) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(key);
			request.onsuccess = () => {
				const data = request.result;
				if (data) {
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
					try {
						const updateRequest = store.put(data, key);
						updateRequest.onsuccess = () => resolve();
						updateRequest.onerror = () => reject(updateRequest.error);
					} catch (e) {
						console.error("Failed to update disk", key, newdata);
						console.error(e);
					}
				} else {
					reject(new Error("Disk not found"));
				}
			};
			request.onerror = () => reject(request.error);
		});
	};

	const renameDisk = async (key: IDBValidKey, newName: string) => {
		return updateDisk(key, { name: newName });
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
		updateDiskFormatting,
		lastLoadedDisk,
	};
}
