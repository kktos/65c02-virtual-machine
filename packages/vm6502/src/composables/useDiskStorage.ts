import type { SymbolDict } from "@/types/machine.interface";

export type DiskInfo = {
	key: IDBValidKey;
	name: string;
	path: string;
	size: number;
	type: "physical" | "url";
};

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
			const request = store.put({ type: "physical", name, path, size: data.byteLength, data, symbols: {} }, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	};

	const saveUrlDisk = async (key: IDBValidKey, name: string, path: string) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put({ type: "url", name, path, size: 0, symbols: {} }, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	};

	type StoredDisk =
		| { name: string; path: string; size: number; type: "physical"; data: ArrayBuffer; symbols?: SymbolDict }
		| { name: string; path: string; size: number; type: "url"; symbols?: SymbolDict };

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
				resolve(result as StoredDisk);
			};
			request.onerror = () => reject(request.error);
		});
	};

	const getAllDisks = async () => {
		const db = await getDb();
		return new Promise<DiskInfo[]>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.openCursor();
			const results: DiskInfo[] = [];

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

	const renameDisk = async (key: IDBValidKey, newName: string) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(key);
			request.onsuccess = () => {
				const data = request.result;
				if (data) {
					data.name = newName;
					const updateRequest = store.put(data, key);
					updateRequest.onsuccess = () => resolve();
					updateRequest.onerror = () => reject(updateRequest.error);
				} else {
					reject(new Error("Disk not found"));
				}
			};
			request.onerror = () => reject(request.error);
		});
	};

	const updateDiskSymbols = async (key: IDBValidKey, symbols: SymbolDict) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(key);
			request.onsuccess = () => {
				const data = request.result;
				if (data) {
					data.symbols = JSON.parse(JSON.stringify(symbols));
					const updateRequest = store.put(data, key);
					updateRequest.onsuccess = () => resolve();
					updateRequest.onerror = () => reject(updateRequest.error);
				} else {
					reject(new Error("Disk not found for updating symbols"));
				}
			};
			request.onerror = () => reject(request.error);
		});
	};

	return { saveDisk, saveUrlDisk, loadDisk, getAllDisks, deleteDisk, renameDisk, updateDiskSymbols };
}
