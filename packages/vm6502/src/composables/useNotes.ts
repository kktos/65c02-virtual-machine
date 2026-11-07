import { computed, ref } from "vue";
import { createMetadataSync } from "@/lib/metadataStore";

export type NoteEntry = {
	/** In-memory identity, assigned at load time; it is not persisted */
	id?: number;
	disk: string;
	addr: number;
	scope: string;
	note: string;
};
export type NoteDict = Record<string, NoteEntry>; // Key is "scope:addr"
/** What is persisted: the disk is implied by the storage key */
export type StoredNote = Omit<NoteEntry, "id" | "disk">;

const SYSTEM_DISK = "*";

// Shared state
const systemDict = ref<NoteDict>({});
const diskDict = ref<NoteDict>({});

const diskKey = ref("");
const store = createMetadataSync("notes");
let nextId = 1;

const dictFor = (disk: string) => (disk === SYSTEM_DISK ? systemDict : diskDict);
const noteKey = (scope: string, addr: number) => `${scope}:${addr}`;

const makeNote = (disk: string, n: StoredNote, id = nextId++): NoteEntry => ({
	id,
	disk,
	addr: n.addr,
	scope: n.scope,
	note: n.note,
});

/** Saves the whole note list of a disk; the snapshot is taken synchronously, as plain objects */
const persist = (disk: string) =>
	store.save<StoredNote>(
		disk,
		Object.values(dictFor(disk).value).map(({ addr, scope, note }) => ({ addr, scope, note })),
	);

const loadDisk = async (disk: string) => {
	const items = await store.load<StoredNote>(disk);
	const dict: NoteDict = {};
	for (const n of items ?? []) dict[noteKey(n.scope, n.addr)] = makeNote(disk, n);
	dictFor(disk).value = dict;
};

const findById = (id: number) =>
	Object.values(systemDict.value).find((n) => n.id === id) ?? Object.values(diskDict.value).find((n) => n.id === id);

export function useNotes() {
	const setDiskKey = async (newKey: string) => {
		diskKey.value = newKey;
		await store.enqueue(() => loadDisk(newKey));
	};

	/** Reloads the system notes and the current disk's notes from storage */
	const reloadNotes = () =>
		store.enqueue(async () => {
			await loadDisk(SYSTEM_DISK);
			if (diskKey.value !== SYSTEM_DISK) await loadDisk(diskKey.value);
		});

	const initNotes = async (machineName: string) => {
		store.setMachine(machineName);
		diskKey.value = SYSTEM_DISK;
		diskDict.value = {};
		await store.enqueue(() => loadDisk(SYSTEM_DISK));
	};

	const addNote = async (address: number, scope: string, note: string) => {
		if (!diskKey.value) throw new Error("Cannot add note without a disk key.");

		await store.ready();
		const disk = diskKey.value;
		const entry = makeNote(disk, { addr: address, scope, note });
		dictFor(disk).value[noteKey(scope, address)] = entry;

		await persist(disk);
		return entry;
	};

	const updateNote = async (id: number, note: string) => {
		await store.ready();
		const current = findById(id);
		if (!current) return;

		dictFor(current.disk).value[noteKey(current.scope, current.addr)] = { ...current, note };
		await persist(current.disk);
	};

	const removeNote = async (id: number) => {
		await store.ready();
		const current = findById(id);
		if (!current) return;

		delete dictFor(current.disk).value[noteKey(current.scope, current.addr)];
		await persist(current.disk);
	};

	const getNoteEntry = (address: number, scope: string): NoteEntry | undefined => {
		const key = noteKey(scope, address);
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
		reloadNotes,
		setDiskKey,
		notes,
		getNoteEntry,
		addNote,
		updateNote,
		removeNote,
		diskKey,
	};
}
