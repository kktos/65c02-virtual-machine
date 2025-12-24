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

	const saveDisk = async (slot: number, name: string, data: ArrayBuffer) => {
		const db = await getDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put({ name, size: data.byteLength, data }, slot);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	};

	const loadDisk = async (slot: number) => {
		const db = await getDb();
		return new Promise<{ name: string; size: number; data: ArrayBuffer } | undefined>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(slot);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	};

	return { saveDisk, loadDisk };
}
