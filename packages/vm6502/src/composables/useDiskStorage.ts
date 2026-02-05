export type DiskInfo =
	| { key: IDBValidKey; name: string; size: number; type: "physical" }
	| { key: IDBValidKey; name: string; size: number; type: "url"; url: string };

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

	const saveDisk = async (key: IDBValidKey, name: string, data: ArrayBuffer) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put({ type: "physical", name, size: data.byteLength, data }, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	};

	const saveUrlDisk = async (key: IDBValidKey, name: string, url: string) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put({ type: "url", name, url, size: 0 }, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	};

	type StoredDisk =
		| { name: string; size: number; data: ArrayBuffer; type: "physical" }
		| { name: string; size: number; url: string; type: "url" };

	const loadDisk = async (key: IDBValidKey): Promise<StoredDisk | undefined> => {
		const db = await getDb();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(key);
			request.onsuccess = () => {
				const result = request.result;
				if (result && !result.type) {
					// backward compatibility for old physical disks
					result.type = "physical";
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
					if (value.type === "url") {
						results.push({ ...base, type: "url", url: value.url });
					} else {
						results.push({ ...base, type: "physical" });
					}
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

	return { saveDisk, saveUrlDisk, loadDisk, getAllDisks, deleteDisk };
}
