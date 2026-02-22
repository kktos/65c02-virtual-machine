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
}));

const DB_NAME = "vm6502_metadata";
const DB_VERSION = 1;
let diskKey: string;

export function useSymbols() {
	const setDiskKey = (newKey: string) => {
		diskKey = newKey;
		loadSymbolsFromDb();
	};

	const getDb = async () => {
		if (!diskKey) throw new Error("No disk key provided");

		const db = await openDB<MetadataDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				const store = db.createObjectStore("symbols", { keyPath: "id", autoIncrement: true });
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
			const tx = db.transaction("symbols", "readonly");
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

	const initSymbols = async (newSymbols?: SymbolDict) => {
		if (!newSymbols) return;

		activeNamespaces.value.clear();

		const db = await getDb();
		const tx = db.transaction("symbols", "readwrite");

		const index = tx.store.index("by-disk");
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
		const targetDict = diskKey === "*" ? systemDict : diskDict;
		targetDict.value = newDict;
	};

	const findSymbolsDB = async (query: string, namespace: string) => {
		const db = await getDb();
		const label = query.toUpperCase();
		const ns = namespace.toUpperCase();

		const getAllFromDisk = async (disk: string) => {
			if (ns != "") {
				const rangeAll = IDBKeyRange.bound([disk, ns, label], [disk, ns, label + "\uffff"]);
				return db.getAllFromIndex("symbols", "by-disk-ns-label", rangeAll);
			}
			const rangeAll = IDBKeyRange.bound([disk, label], [disk, label + "\uffff"]);
			return db.getAllFromIndex("symbols", "by-disk-label", rangeAll);
		};

		if (diskKey === "*") return getAllFromDisk("*");

		const [exact, wildcard] = await Promise.all([getAllFromDisk("*"), getAllFromDisk(diskKey)]);
		return exact.concat(wildcard);
	};

	const findSymbols = (query: string, namespace = "") => {
		const labelQuery = query.toUpperCase();
		const nsQuery = namespace.toUpperCase();
		const results: SymbolEntry[] = [];

		const searchInDict = (dict: SymbolDict) => {
			for (const namespaces of Object.values(dict)) {
				if (!namespaces) continue;
				for (const ns in namespaces) {
					if (nsQuery && ns.toUpperCase() !== nsQuery) continue;
					const entry = namespaces[ns];
					if (entry?.label.toUpperCase().startsWith(labelQuery)) results.push(entry);
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
		const id = await db.add("symbols", symbol);

		const newSym = { ...symbol, id: Number(id) };
		const targetDict = diskKey === "*" ? systemDict : diskDict;
		if (!targetDict.value[address]) targetDict.value[address] = {};
		targetDict.value[address][namespace] = newSym;

		if (!activeNamespaces.value.has(namespace)) activeNamespaces.value.set(namespace, true);
		return id;
	};

	const updateSymbol = async (id: number, address: number, label: string, namespace: string, scope: string) => {
		const db = await getDb();
		const tx = db.transaction("symbols", "readwrite");
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
		const record = await db.get("symbols", id);
		if (!record) return;

		await db.delete("symbols", id);

		const targetDict = record.disk === "*" ? systemDict : diskDict;
		// Update Memory
		const entry = targetDict.value[record.addr];
		if (entry && entry[record.ns]) {
			delete entry[record.ns];
			if (Object.keys(entry).length === 0) delete targetDict.value[record.addr];
		}
	};

	const getUserSymbols = () => {
		/*
		const allSymbols = diskDict.value;

		const userSymbols: SymbolDict = {};

		for (const [addrStr, namespaces] of Object.entries(allSymbols)) {
			if (namespaces.user) {
				const addr = Number(addrStr);
				userSymbols[addr] = { user: namespaces.user };
			}
		}
		return userSymbols;
		*/
	};

	const clearUserSymbols = () => {
		// const allSymbols = diskDict.value;
		// for (const namespaces of Object.values(allSymbols)) {
		// 	if (namespaces.user) delete namespaces.user;
		// }
	};

	const generateSymFileContent = (symbols: SymbolDict, namespace: string): string => {
		if (!symbols) return "";
		let content = `${namespace}:\n`;
		const sortedAddresses = Object.keys(symbols)
			.map(Number)
			.sort((a, b) => a - b);

		for (const address of sortedAddresses) {
			const nsData = symbols[address];
			if (nsData?.[namespace]) {
				const label = nsData[namespace].label;
				const addressHex = address.toString(16).toUpperCase().padStart(4, "0");
				content += `  ${label}: number = $${addressHex}\n`;
			}
		}
		return content;
	};

	const buildNamespacesFromSymbols = (symbols: SymbolDict) => {
		// for (const namespaces of Object.values(symbols)) {
		// 	Object.keys(namespaces).forEach((ns) => {
		// 		if (!activeNamespaces.value.has(ns)) {
		// 			activeNamespaces.value.set(ns, true);
		// 		}
		// 	});
		// }
	};

	const resolveActiveNamespace = (address: number, scope = "main"): string | undefined => {
		// const allSymbols = diskDict.value;
		// const map = allSymbols[address];
		// if (!map) return undefined;
		// // const currentMemoryScope = vm?.value?.getScope(address) ?? "main";
		// // Look for an active namespace that has a symbol for this address AND matches the memory scope
		// for (const [ns, isActive] of activeNamespaces.value) {
		// 	if (!isActive) continue;
		// 	const entry = map[ns];
		// 	if (entry) {
		// 		// Check if the symbol's scope matches the VM's current memory scope
		// 		// We handle legacy entries that might not have a scope property by defaulting to 'main'
		// 		const entryScope = entry.scope;
		// 		if (entryScope === scope) return ns;
		// 	}
		// }
		// return undefined;
	};

	const getLabeledInstruction = (opcode: string) => {
		// if (!labels) return { labeledOpcode: opcode, labelComment: null };

		const addressMatch = opcode.match(/\$([0-9A-Fa-f]{2,4}[\w,()]?)/);

		if (addressMatch) {
			const address = parseInt(addressMatch[1] ?? "", 16);

			const fullAddressExpression = addressMatch[0];
			const addressHexMatch = fullAddressExpression.match(/([0-9A-Fa-f]{2,4})/);

			if (addressHexMatch) {
				// const addressHex = addressHexMatch[1] as string;
				// const address = parseInt(addressHex, 16);

				// Determine scope for the target address
				const entry = getSymbolForAddress(address);
				if (entry) {
					const label = entry.label;
					// Replace the address part with the label, keeping the addressing mode suffix
					const suffix = fullAddressExpression.substring(addressHexMatch[0].length + 1);
					const newOpcode = opcode.replace(fullAddressExpression, label + suffix);
					const comment = `$${address.toString(16).toUpperCase().padStart(4, "0")}`;
					return { labeledOpcode: newOpcode, labelComment: comment };
				}
			}
		}

		return { labeledOpcode: opcode, labelComment: null };
	};

	const addSymbolsFromText = async (text: string) => {
		const db = await getDb();
		const tx = db.transaction("symbols", "readwrite");
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

		getLabeledInstruction,
		addSymbolsFromText,

		getLabelForAddress,
		getSymbolForAddress,
		getAddressForLabel,

		getNamespaceList,
		toggleNamespace,
		addSymbol,
		removeSymbol,
		updateSymbol,

		getUserSymbols,
		clearUserSymbols,

		generateSymFileContent,
		buildNamespacesFromSymbols,

		systemDict,
		diskDict,
		symbolsState,
		findSymbols,
		findSymbolsDB,
	};
}
