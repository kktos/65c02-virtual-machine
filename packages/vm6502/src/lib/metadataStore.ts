import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Persistent storage for per-machine, per-disk metadata (symbols, data formattings, notes).
 *
 * All searching happens in memory: the database is only a key/value store holding,
 * for each (machine, kind, disk), the whole list of items as one record.
 * The schema is fixed, so the database never needs a version upgrade at runtime.
 */

export const METADATA_DB_NAME = "vm6502_metadata_v2";
const STORE = "metadata";

export type MetadataKind = "symbols" | "formats" | "notes" | "routines";
export type MetadataKey = [machine: string, kind: MetadataKind, disk: string];

type StoredRecord = { version: 1; items: unknown[] };

interface MetadataDB extends DBSchema {
	metadata: {
		key: MetadataKey;
		value: StoredRecord;
	};
}

let dbPromise: Promise<IDBPDatabase<MetadataDB>> | null = null;

const getDb = () => {
	dbPromise ??= openDB<MetadataDB>(METADATA_DB_NAME, 1, {
		upgrade(db) {
			db.createObjectStore(STORE);
		},
		blocking() {
			// A newer version of the app wants to upgrade the schema: release our connection.
			void dbPromise?.then((db) => db.close());
			dbPromise = null;
		},
	}).catch((e) => {
		dbPromise = null;
		throw e;
	});
	return dbPromise;
};

/** Same normalisation as the legacy per-machine store names, e.g. "Apple //e" -> "apple_//e" */
export const toMachineKey = (machineName: string) => machineName.replace(/ /g, "_").toLowerCase();

const keyOf = (machine: string, kind: MetadataKind, disk: string): MetadataKey => [machine, kind, String(disk)];

/** Returns the stored items, or undefined when nothing was ever stored for this key. */
export async function loadMetadata<T>(machine: string, kind: MetadataKind, disk: string): Promise<T[] | undefined> {
	const db = await getDb();
	const record = await db.get(STORE, keyOf(machine, kind, disk));
	return record?.items as T[] | undefined;
}

/**
 * Replaces the whole list stored for this key.
 * `items` must be plain objects (no Vue proxies): IndexedDB cannot clone proxies.
 * Saves are applied in call order, so the last call always wins.
 */
export async function saveMetadata<T>(machine: string, kind: MetadataKind, disk: string, items: T[]) {
	const key = keyOf(machine, kind, disk);
	const db = await getDb();
	if (items.length === 0) await db.delete(STORE, key);
	else await db.put(STORE, { version: 1, items }, key);
}

/**
 * Per-collection helper: remembers the current machine and serialises loads,
 * so a mutation awaiting `ready()` never works on a dict that a pending load is about to replace.
 */
export function createMetadataSync(kind: MetadataKind) {
	let machine = "";
	let pending: Promise<void> = Promise.resolve();

	return {
		setMachine: (machineName: string) => {
			machine = toMachineKey(machineName);
		},
		load: <T>(disk: string): Promise<T[] | undefined> =>
			machine ? loadMetadata<T>(machine, kind, disk) : Promise.resolve(undefined),
		save: <T>(disk: string, items: T[]): Promise<void> =>
			machine ? saveMetadata(machine, kind, disk, items) : Promise.resolve(),
		enqueue: <T>(task: () => Promise<T>): Promise<T> => {
			const result = pending.then(task);
			pending = result.then(
				() => undefined,
				(e) => console.error(`Failed to load ${kind}`, e),
			);
			return result;
		},
		ready: () => pending,
	};
}
