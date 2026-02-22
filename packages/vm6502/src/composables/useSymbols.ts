import { computed, ref } from "vue";
import { openDB, type DBSchema } from "idb";

export type SymbolEntry = {
	id?: number;
	disk: string;
	label: string;
	src: string;
	scope: string;
	ns: string;
	addr: number;
};
export type SymbolDict = Record<number, Record<string, SymbolEntry>>;

interface MetadataDB extends DBSchema {
	symbols: {
		key: number;
		value: SymbolEntry;
		indexes: {
			"by-ns": string;
			"by-disk-ns-label": [string, string, string];
			"by-disk-label": [string, string];
			"by-disk": [string];
			"by-addr": [number];
			"by-addr-scope": [number, string];
		};
	};
}

// Shared state for active namespaces across components
const activeNamespaces = ref<Map<string, boolean>>(new Map());
const systemDict = ref<SymbolDict>({});
const diskDict = ref<SymbolDict>({});
const symbolsState = computed(() => ({
	dictA: systemDict.value,
	dictB: diskDict.value,
	activeNamespaces: activeNamespaces.value,
}));

const DB_NAME = "vm6502_metadata";
let diskKey: string;
let storeName = "";

export function useSymbols() {
	const setDiskKey = (newKey: string) => {
		diskKey = newKey;
		loadSymbolsFromDb();
	};

	const getDb = async () => {
		if (!diskKey) throw new Error("No disk key provided");
		if (!storeName) throw new Error("No store name provided");

		// 1. Probe the current version
		const probeDb = await openDB(DB_NAME);
		const currentVersion = probeDb.version;
		const storeExists = probeDb.objectStoreNames.contains(storeName);
		probeDb.close();

		if (storeExists) return openDB<MetadataDB>(DB_NAME);

		const db = await openDB<MetadataDB>(DB_NAME, currentVersion + 1, {
			upgrade(db) {
				const store = db.createObjectStore(storeName as unknown as "symbols", {
					keyPath: "id",
					autoIncrement: true,
				});
				store.createIndex("by-ns", "namespace");
				store.createIndex("by-disk-ns-label", ["disk", "ns", "label"]);
				store.createIndex("by-disk-label", ["disk", "label"]);
				store.createIndex("by-disk", ["disk"]);
				store.createIndex("by-addr", ["addr"]);
				store.createIndex("by-addr-scope", ["addr", "scope"]);
			},
		});
		return db;
	};

	const loadSymbolsFromDb = async () => {
		if (!diskKey) return;
		try {
			const db = await getDb();
			const tx = db.transaction(storeName as unknown as "symbols", "readonly");
			const index = tx.store.index("by-disk");

			const foundNamespaces = new Set<string>();
			const newDiskDict: SymbolDict = {};
			const diskSymbols = await index.getAll([diskKey]);
			for (const sym of diskSymbols) {
				if (!newDiskDict[sym.addr]) newDiskDict[sym.addr] = {};
				newDiskDict[sym.addr]![sym.ns] = sym;
				foundNamespaces.add(sym.ns);
			}

			const targetDict = diskKey === "*" ? systemDict : diskDict;
			targetDict.value = newDiskDict;

			for (const ns of foundNamespaces) if (!activeNamespaces.value.has(ns)) activeNamespaces.value.set(ns, true);
		} catch (e) {
			console.error("Failed to load symbols", e);
		}
	};

	const initSymbols = async (machineName: string, newSymbols?: SymbolDict) => {
		storeName = `${machineName.replace(/ /g, "_").toLowerCase()}_symbols`;
		activeNamespaces.value.clear();

		if (!newSymbols) return;

		diskKey = "*";
		const db = await getDb();
		const tx = db.transaction(storeName as unknown as "symbols", "readwrite");
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

	const findSymbolsDB = async (query: string, namespace: string) => {
		const db = await getDb();
		const label = query.toUpperCase();
		const ns = namespace.toUpperCase();

		const getAllFromDisk = async (disk: string) => {
			if (ns != "") {
				const rangeAll = IDBKeyRange.bound([disk, ns, label], [disk, ns, label + "\uffff"]);
				return db.getAllFromIndex(storeName as unknown as "symbols", "by-disk-ns-label", rangeAll);
			}
			const rangeAll = IDBKeyRange.bound([disk, label], [disk, label + "\uffff"]);
			return db.getAllFromIndex(storeName as unknown as "symbols", "by-disk-label", rangeAll);
		};

		if (diskKey === "*") return getAllFromDisk("*");

		const [exact, wildcard] = await Promise.all([getAllFromDisk("*"), getAllFromDisk(diskKey)]);
		return exact.concat(wildcard);
	};

	const findSymbols = (query: string, namespace = "") => {
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

	const addSymbol = async (address: number, label: string, namespace = "user", scope = "main") => {
		const db = await getDb();
		const symbol = {
			disk: diskKey,
			ns: namespace,
			label,
			addr: address,
			src: "",
			scope,
		};
		const id = await db.add(storeName as unknown as "symbols", symbol);

		const newSym = { ...symbol, id: Number(id) };
		const targetDict = diskKey === "*" ? systemDict : diskDict;
		if (!targetDict.value[address]) targetDict.value[address] = {};
		targetDict.value[address][namespace] = newSym;

		if (!activeNamespaces.value.has(namespace)) activeNamespaces.value.set(namespace, true);
		return id;
	};

	const updateSymbol = async (id: number, address: number, label: string, namespace: string, scope: string) => {
		const db = await getDb();
		const tx = db.transaction(storeName as unknown as "symbols", "readwrite");
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

		if (!activeNamespaces.value.has(namespace)) activeNamespaces.value.set(namespace, true);
	};

	const removeSymbol = async (id: number) => {
		const db = await getDb();
		const record = await db.get(storeName as unknown as "symbols", id);
		if (!record) return;

		await db.delete(storeName as unknown as "symbols", id);

		const targetDict = record.disk === "*" ? systemDict : diskDict;
		// Update Memory
		const entry = targetDict.value[record.addr];
		if (entry && entry[record.ns]) {
			delete entry[record.ns];
			if (Object.keys(entry).length === 0) delete targetDict.value[record.addr];
		}
	};

	const generateTextFromSymbols = (): string => {
		const groups = new Map<string, SymbolEntry[]>();

		for (const addrMap of Object.values(diskDict.value)) {
			for (const symbol of Object.values(addrMap)) {
				const key = JSON.stringify({ ns: symbol.ns, scope: symbol.scope });
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key)?.push(symbol);
			}
		}

		let output = "";
		const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
			const ka = JSON.parse(a);
			const kb = JSON.parse(b);
			if (ka.ns !== kb.ns) return ka.ns.localeCompare(kb.ns);
			return ka.scope.localeCompare(kb.scope);
		});

		for (const key of sortedKeys) {
			const { ns, scope } = JSON.parse(key);
			const entries = groups.get(key)!;
			entries.sort((a, b) => a.addr - b.addr);

			let header = ns;
			if (!/^[\w%]+$/.test(ns)) {
				header = `'${ns}'`;
			}

			if (scope && scope !== "main") {
				header += ` [scope=${scope}]`;
			}
			header += ":\n";
			output += header;

			for (const sym of entries) {
				const addrHex = sym.addr.toString(16).toUpperCase().padStart(4, "0");
				let line = `  ${sym.label}: number = $${addrHex}`;
				if (sym.src) {
					line += ` ;${sym.src}`;
				}
				output += `${line}\n`;
			}
			output += "\n";
		}

		return output;
	};

	const addSymbolsFromText = async (text: string) => {
		const db = await getDb();
		const tx = db.transaction(storeName as unknown as "symbols", "readwrite");
		const lines = text.split(/\r?\n/);

		let currentNamespace = "user";
		let currentScope = "main";

		const promises: Promise<void>[] = [];

		for (const line of lines) {
			// Parse Namespace Line (Column 0)
			// Matches: NAMESPACE: or 'NAMESPACE': or NAMESPACE [METADATA]:
			const nsMatch = line.match(/^(['"]?)([\w%]+)\1(?:\s*\[(.*)\])?:\s*$/) as [unknown, string, string, string];
			if (nsMatch) {
				currentNamespace = nsMatch[2];
				currentScope = "main"; // Reset scope for new namespace
				if (nsMatch[3]) {
					const scopeMatch = nsMatch[3].match(/SCOPE=([^\]\s]+)/) as [unknown, string];
					if (scopeMatch) currentScope = scopeMatch[1];
				}
				if (!activeNamespaces.value.has(currentNamespace)) activeNamespaces.value.set(currentNamespace, true);
				continue;
			}

			// Parse Symbol Line (Column 2+)
			// Matches:   LABEL: number = $HEX ;source
			const symMatch = line.match(/^\s+([\w]+):\s+number\s+=\s+\$([0-9A-Fa-f]+)\s*(?:;(.*))?$/) as [
				unknown,
				string,
				string,
				string,
			];
			if (symMatch) {
				const symbol: SymbolEntry = {
					disk: diskKey,
					ns: currentNamespace,
					label: symMatch[1],
					addr: parseInt(symMatch[2], 16),
					src: symMatch[3] ? symMatch[3].trim() : "",
					scope: currentScope,
				};
				promises.push(
					tx.store.add(symbol).then((id) => {
						const s = { ...symbol, id: Number(id) };
						const targetDict = diskKey === "*" ? systemDict : diskDict;
						if (!targetDict.value[s.addr]) targetDict.value[s.addr] = {};
						targetDict.value[s.addr]![s.ns] = s;
					}),
				);
			}
		}
		await Promise.all(promises);
		await tx.done;
	};

	const getSymbolForAddress = (address: number, scope?: string) => {
		const search = (dict: SymbolDict) => {
			const map = dict[address];
			if (!map) return undefined;
			for (const ns in map) {
				if (!activeNamespaces.value.get(ns)) continue;
				const sym = map[ns];
				if (scope && sym?.scope !== scope) continue;
				return sym;
			}
			return undefined;
		};
		return search(diskDict.value) ?? search(systemDict.value);
	};

	const getLabelForAddress = (address: number, scope?: string) => {
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

	const getAddressForLabel = (label: string) => {
		const upperSymbol = label.toUpperCase();
		const search = (dict: SymbolDict) => {
			for (const addressStr in dict) {
				const address = parseInt(addressStr, 10);
				const namespaces = dict[address];
				if (!namespaces) continue;
				for (const ns in namespaces) {
					if (!activeNamespaces.value.get(ns)) continue;
					const entry = namespaces[ns];
					if (entry?.label?.toUpperCase() === upperSymbol) return address;
				}
			}
			return undefined;
		};
		return search(diskDict.value) ?? search(systemDict.value);
	};

	const getNamespaceList = () => Array.from(activeNamespaces.value.entries());

	const toggleNamespace = (ns: string) => {
		const isActive = activeNamespaces.value.get(ns) ?? false;
		activeNamespaces.value.set(ns, !isActive);
	};

	return {
		initSymbols,
		setDiskKey,

		addSymbolsFromText,
		generateTextFromSymbols,

		getLabelForAddress,
		getSymbolForAddress,
		getAddressForLabel,

		getNamespaceList,
		toggleNamespace,

		addSymbol,
		removeSymbol,
		updateSymbol,
		findSymbols,
		findSymbolsDB,

		symbolsState,
		diskKey,
	};
}
