import { computed, ref } from "vue";
import { openDB, type DBSchema } from "idb";

export type NoteEntry = {
	id?: number;
	disk: string;
	addr: number;
	scope: string;
	note: string;
};
export type NoteDict = Record<string, NoteEntry>; // Key is "scope:addr"

interface MetadataDB extends DBSchema {
	notes: {
		key: number;
		value: NoteEntry;
		indexes: {
			"by-disk": string;
			"by-disk-addr-scope": [string, number, string];
		};
	};
}

// Shared state
const systemDict = ref<NoteDict>({});
const diskDict = ref<NoteDict>({});

const DB_NAME = "vm6502_metadata";
let diskKey = ref("");
let storeName = "";

export function useNotes() {
	const setDiskKey = async (newKey: string) => {
		diskKey.value = newKey;
		await loadNotesFromDb();
		console.log("Notes::setDiskKey", diskKey.value);
	};

	const getDb = async () => {
		if (!storeName) throw new Error("No store name provided");

		// 1. Probe the current version
		const probeDb = await openDB(DB_NAME);
		const currentVersion = probeDb.version;
		const storeExists = probeDb.objectStoreNames.contains(storeName);
		probeDb.close();

		if (storeExists) return openDB<MetadataDB>(DB_NAME);
		else {
			console.log(
				`${DB_NAME}v${currentVersion} ${storeName} does not exist. Creating in v${currentVersion + 1}...`,
			);
		}

		const db = await openDB<MetadataDB>(DB_NAME, currentVersion + 1, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(storeName as any)) {
					const store = db.createObjectStore(storeName as unknown as "notes", {
						keyPath: "id",
						autoIncrement: true,
					});
					store.createIndex("by-disk", "disk");
					store.createIndex("by-disk-addr-scope", ["disk", "addr", "scope"], { unique: true });
				}
			},
			blocking(_currentVersion, _blockedVersion, event) {
				(event.target as IDBDatabase).close();
			},
		});
		return db;
	};

	const loadNotesFromDb = async () => {
		if (!diskKey.value) return;
		try {
			const db = await getDb();
			const tx = db.transaction(storeName as unknown as "notes", "readonly");
			const index = tx.store.index("by-disk");

			const newDict: NoteDict = {};
			const diskNotes = await index.getAll(diskKey.value);
			for (const note of diskNotes) {
				const key = `${note.scope}:${note.addr}`;
				newDict[key] = note;
			}

			if (diskKey.value === "*") systemDict.value = newDict;
			else diskDict.value = newDict;
		} catch (e) {
			console.error("Failed to load notes", e);
		}
	};

	const initNotes = async (machineName: string) => {
		storeName = `${machineName.replace(/ /g, "_").toLowerCase()}_notes`;
		diskKey.value = "*";
		await loadNotesFromDb(); // load system notes
		// diskKey.value = "";
		diskDict.value = {};
	};

	const addNote = async (address: number, scope: string, note: string) => {
		if (!diskKey.value) throw new Error("Cannot add note without a disk key.");

		const db = await getDb();
		const entry: Omit<NoteEntry, "id"> = {
			disk: diskKey.value,
			addr: address,
			scope,
			note,
		};
		const id = await db.add(storeName as unknown as "notes", entry as NoteEntry);

		const newNote: NoteEntry = { ...entry, id: Number(id) };
		const key = `${scope}:${address}`;

		const targetDict = diskKey.value === "*" ? systemDict : diskDict;
		targetDict.value[key] = newNote;

		return newNote;
	};

	const updateNote = async (id: number, note: string) => {
		const db = await getDb();
		const record = await db.get(storeName as unknown as "notes", id);
		if (!record) return;

		record.note = note;
		await db.put(storeName as unknown as "notes", record);

		const key = `${record.scope}:${record.addr}`;
		const targetDict = record.disk === "*" ? systemDict : diskDict;
		targetDict.value[key] = record;
	};

	const removeNote = async (id: number) => {
		const db = await getDb();
		const record = await db.get(storeName as unknown as "notes", id);
		if (!record) return;

		await db.delete(storeName as unknown as "notes", id);

		const key = `${record.scope}:${record.addr}`;
		const targetDict = record.disk === "*" ? systemDict : diskDict;
		delete targetDict.value[key];
	};

	const getNoteEntry = (address: number, scope: string): NoteEntry | undefined => {
		const key = `${scope}:${address}`;
		return diskDict.value[key] ?? systemDict.value[key];
	};

	const notes = computed(() => {
		const allNotes: Record<string, string> = {};
		const combined = { ...systemDict.value, ...diskDict.value };
		for (const [key, entry] of Object.entries(combined)) {
			allNotes[key] = entry.note;
		}
		return allNotes;
	});

	return {
		initNotes,
		setDiskKey,
		notes,
		getNoteEntry,
		addNote,
		updateNote,
		removeNote,
		diskKey,
	};
}
