import { computed, ref } from "vue";
import { openDB, type DBSchema } from "idb";
import type { SymbolEntry } from "./useSymbols";

export type NoteEntry = {
	id?: number;
	disk: string;
	addr: number;
	scope: number;
	note: string;
};
export type SymbolDict = Record<number, Record<string, NoteEntry>>;

interface MetadataDB extends DBSchema {
	notes: {
		key: number;
		value: NoteEntry;
		indexes: {
			"by-disk": [string];
		};
	};
}

// Shared state for active namespaces across components
const systemDict = ref<SymbolDict>({});
const diskDict = ref<SymbolDict>({});
const notesState = computed(() => ({
	dictA: systemDict.value,
	dictB: diskDict.value,
}));

const DB_NAME = "vm6502_metadata";
let diskKey = ref("");
let storeName = "";

export function useSymbols() {
	const setDiskKey = (newKey: string) => {
		diskKey.value = newKey;
		loadNotesFromDb();
	};

	const getDb = async () => {
		if (!diskKey.value) throw new Error("No disk key provided");
		if (!storeName) throw new Error("No store name provided");

		// 1. Probe the current version
		const probeDb = await openDB(DB_NAME);
		const currentVersion = probeDb.version;
		const storeExists = probeDb.objectStoreNames.contains(storeName);
		probeDb.close();

		if (storeExists) return openDB<MetadataDB>(DB_NAME);

		const db = await openDB<MetadataDB>(DB_NAME, currentVersion + 1, {
			upgrade(db) {
				const store = db.createObjectStore(storeName as unknown as "notes", {
					keyPath: "id",
					autoIncrement: true,
				});
				store.createIndex("by-disk", ["disk"]);
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

			const foundNamespaces = new Set<string>();
			const newDiskDict: SymbolDict = {};
			const diskSymbols = await index.getAll([diskKey.value]);
			for (const sym of diskSymbols) {
				if (!newDiskDict[sym.addr]) newDiskDict[sym.addr] = {};
				newDiskDict[sym.addr]![sym.ns] = sym;
				foundNamespaces.add(sym.ns);
			}

			const targetDict = diskKey.value === "*" ? systemDict : diskDict;
			targetDict.value = newDiskDict;
		} catch (e) {
			console.error("Failed to load symbols", e);
		}
	};

	const initNotes = async (machineName: string, newSymbols?: SymbolDict) => {
		storeName = `${machineName.replace(/ /g, "_").toLowerCase()}_symbols`;

		if (!newSymbols) return;

		diskKey.value = "*";
		const db = await getDb();
		const tx = db.transaction(storeName as unknown as "notes", "readwrite");
		const index = tx.store.index("by-disk");
		const count = await index.count();
		if (count) {
			console.log(`Symbols: Found ${count} System symbols in DB.`);
			return;
		}

		console.log("Symbols: Creating system symbols in DB...");

		const keys = await index.getAllKeys([diskKey]);
		await Promise.all(keys.map((key) => tx.store.delete(key)));

		const promises: Promise<IDBValidKey>[] = [];
		const newDict: SymbolDict = {};

		for (const [addrStr, namespaces] of Object.entries(newSymbols)) {
			for (const [namespace, data] of Object.entries(namespaces)) {
				const scope = data.scope;
				const addr = Number(addrStr);
				const symbol = {
					disk: diskKey,
					ns: namespace,
					label: data.label,
					addr: addr,
					src: data.src,
					scope,
				};
				promises.push(
					tx.store.add(symbol).then((id) => {
						const s = { ...symbol, id: Number(id) };
						if (!newDict[addr]) newDict[addr] = {};
						newDict[addr][namespace] = s;
						return id;
					}),
				);
				if (!activeNamespaces.value.has(namespace)) activeNamespaces.value.set(namespace, true);
			}
		}
		await Promise.all(promises);
		await tx.done;
		systemDict.value = newDict;
	};

	const findNotes = (query: string, namespace = "") => {
		const labelQuery = query.toUpperCase();
		const nsQuery = namespace.toUpperCase();

		// Prepare address query
		const hexQuery = query.replace(/^(\$|0x)/i, "").toUpperCase();
		const isHex = /^[0-9A-F]+$/.test(hexQuery);

		const results: SymbolEntry[] = [];

		const searchInDict = (dict: SymbolDict) => {
			for (const namespaces of Object.values(dict)) {
				if (!namespaces) continue;
				for (const ns in namespaces) {
					if (nsQuery && ns.toUpperCase() !== nsQuery) continue;
					const entry = namespaces[ns];
					if (!entry) continue;

					if (entry.label.toUpperCase().startsWith(labelQuery)) {
						results.push(entry);
						continue;
					}

					if (isHex) {
						const addrStr = entry.addr.toString(16).toUpperCase().padStart(4, "0");
						if (addrStr.startsWith(hexQuery)) results.push(entry);
					}
				}
			}
		};

		searchInDict(systemDict.value);
		searchInDict(diskDict.value);

		return results;
	};

	const addNote = async (address: number, label: string, namespace = "user", scope = "main") => {
		const db = await getDb();
		const symbol = {
			disk: diskKey,
			ns: namespace,
			label,
			addr: address,
			src: "",
			scope,
		};
		const id = await db.add(storeName as unknown as "notes", symbol);

		const newSym = { ...symbol, id: Number(id) };
		const targetDict = diskKey === "*" ? systemDict : diskDict;
		if (!targetDict.value[address]) targetDict.value[address] = {};
		targetDict.value[address][namespace] = newSym;

		return id;
	};

	const updateNote = async (id: number, address: number, label: string, namespace: string, scope: string) => {
		const db = await getDb();
		const tx = db.transaction(storeName as unknown as "notes", "readwrite");
		const store = tx.store;

		const record = await store.get(id);
		if (!record) return;

		const oldAddr = record.addr;
		const oldNs = record.ns;

		record.label = label;
		record.addr = address;
		record.ns = namespace;
		record.scope = scope;

		await store.put(record);
		await tx.done;

		const targetDict = record.disk === "*" ? systemDict : diskDict;

		// Update Memory
		if (targetDict.value[oldAddr]?.[oldNs]) {
			delete targetDict.value[oldAddr][oldNs];
			if (Object.keys(targetDict.value[oldAddr]).length === 0) delete targetDict.value[oldAddr];
		}
		if (!targetDict.value[address]) targetDict.value[address] = {};
		targetDict.value[address][namespace] = record;
	};

	const removeNote = async (id: number) => {
		const db = await getDb();
		const record = await db.get(storeName as unknown as "notes", id);
		if (!record) return;

		await db.delete(storeName as unknown as "notes", id);

		const targetDict = record.disk === "*" ? systemDict : diskDict;
		// Update Memory
		const entry = targetDict.value[record.addr];
		if (entry && entry[record.ns]) {
			delete entry[record.ns];
			if (Object.keys(entry).length === 0) delete targetDict.value[record.addr];
		}
	};

	const getNoteForAddress = (address: number, scope?: string) => {
		const search = (dict: SymbolDict) => {
			const map = dict[address];
			if (!map) return undefined;
			for (const ns in map) {
				if (!activeNamespaces.value.get(ns)) continue;
				const sym = map[ns];
				if (scope && sym?.scope !== scope) continue;
				return sym?.label;
			}
			return undefined;
		};
		return search(diskDict.value) ?? search(systemDict.value);
	};

	return {
		initNotes,
		setDiskKey,

		getNoteForAddress,
		addNote,
		updateNote,
		removeNote,
		findNotes,

		notesState,
		diskKey,
	};
}
