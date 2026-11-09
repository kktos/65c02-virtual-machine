import { computed, readonly, ref, type Ref } from "vue";
import { toHex } from "@/lib/hex.utils";
import { createMetadataSync } from "@/lib/metadataStore";

export type SymbolEntry = {
	/** In-memory identity, assigned at load time; it is not persisted */
	id?: number;
	disk: string;
	label: string;
	src: string;
	scope: string;
	ns: string;
	addr: number;
	/** Bytes covered by the label (a LABELS range): `label+offset` is only used inside them */
	size?: number;
};
export type SymbolDict = Record<number, Record<string, SymbolEntry>>;
/** What is persisted: the disk is implied by the storage key */
export type StoredSymbol = Omit<SymbolEntry, "id" | "disk">;

export type SearchSuggestion = {
	label: string;
	addr: number;
	scope?: string;
	icon?: string;
	value?: string;
};
export type SearchProvider = (query: string) => Promise<SearchSuggestion[]> | SearchSuggestion[];

/**
 * Attributes on a range of addresses, declared in LABELS by a line with flags: `$C080:$C0FF [noindex]`.
 * They are not persisted: the machine's init routine declares them again on every load.
 */
export type AddressRange = { ns: string; scope: string; start: number; end: number; flags: RangeFlag[] };
/** noindex: an indexed operand (`,X` / `,Y`) whose base is in the range is shown as is, without a label */
export const RANGE_FLAGS = ["noindex"] as const;
export type RangeFlag = (typeof RANGE_FLAGS)[number];

/** `end` is set for a range only (`$START:$END`), even a 1-byte one */
export type LabelsLine = { label?: string; start: number; end?: number; flags: RangeFlag[] };

const HEX_ADDR = "(?:\\$|0x)?([0-9A-Fa-f]+)";
const LABELS_LINE_RE = new RegExp(
	`^${HEX_ADDR}(?::${HEX_ADDR})?(?:\\s+([^\\s\\[;]+))?(?:\\s*\\[([^\\]]*)\\])?(?:\\s*;.*)?$`,
);

/**
 * Parses a line of a LABELS block:
 *   $ADDR label                 a label
 *   $ADDR [flag, ...]           attributes on one address
 *   $START:$END label           a label covering the range: its size is END-START+1
 *   $START:$END [flag, ...]     attributes on the range (see RANGE_FLAGS)
 *   $START:$END label [flag]    both
 * A `; comment` may end the line. Returns an error message when the line is invalid.
 */
export const parseLabelsLine = (line: string): LabelsLine | string => {
	const m = line.trim().match(LABELS_LINE_RE);
	if (!m) return `invalid line "${line.trim()}"`;
	const [, startStr, endStr, label, flagsStr] = m;
	const start = parseInt(startStr!, 16);
	const end = endStr === undefined ? undefined : parseInt(endStr, 16);
	if (end !== undefined && end < start) return `invalid range "${startStr}:${endStr}": the end is before the start`;

	const flags: RangeFlag[] = [];
	for (const flag of (flagsStr ?? "").split(/[\s,]+/).filter(Boolean)) {
		const lower = flag.toLowerCase();
		if (!(RANGE_FLAGS as readonly string[]).includes(lower))
			return `unknown flag "${flag}" (known: ${RANGE_FLAGS.join(", ")})`;
		flags.push(lower as RangeFlag);
	}
	if (!label && flags.length === 0) return `no label nor flag on "${line.trim()}"`;
	return { label, start, end, flags };
};

const SYSTEM_DISK = "*";
const NAME_RE = /^[A-Za-z_][A-Za-z_0-9]*/;

// Shared state for active namespaces across components
const activeNamespaces = ref<Map<string, boolean>>(new Map());
const systemDict = ref<SymbolDict>({});
const diskDict = ref<SymbolDict>({});
const scopeSearchPath = ref<string[]>([]);
const addressRanges = ref<AddressRange[]>([]);
const symbolsState = computed(() => ({
	dictA: systemDict.value,
	dictB: diskDict.value,
	activeNamespaces: activeNamespaces.value,
	// scopeSearchPath: scopeSearchPath.value,
}));

const symbolDiskKey = ref("");
const store = createMetadataSync("symbols");
let nextId = 1;

const dictFor = (disk: string) => (disk === SYSTEM_DISK ? systemDict : diskDict);

const registerNamespace = (ns: string) => {
	if (!activeNamespaces.value.has(ns)) activeNamespaces.value.set(ns, true);
};

const makeEntry = (disk: string, s: StoredSymbol, id = nextId++): SymbolEntry => ({
	id,
	disk,
	ns: s.ns,
	label: s.label,
	addr: s.addr,
	scope: s.scope || "main",
	src: s.src ?? "",
	...(s.size !== undefined && { size: s.size }),
});

function* allEntries(dict: SymbolDict) {
	for (const byNs of Object.values(dict)) if (byNs) yield* Object.values(byNs);
}

/** Saves the whole symbol list of a disk; the snapshot is taken synchronously, as plain objects */
const persist = (disk: string) =>
	store.save<StoredSymbol>(
		disk,
		Array.from(allEntries(dictFor(disk).value), ({ ns, label, addr, scope, src, size }) => ({
			ns,
			label,
			addr,
			scope,
			src,
			...(size !== undefined && { size }),
		})),
	);

const loadDisk = async (disk: string) => {
	const items = await store.load<StoredSymbol>(disk);
	const dict: SymbolDict = {};
	for (const s of items ?? []) {
		(dict[s.addr] ??= {})[s.ns] = makeEntry(disk, s);
		registerNamespace(s.ns);
	}
	dictFor(disk).value = dict;
	return items;
};

const findById = (id: number) => {
	for (const dict of [systemDict.value, diskDict.value]) for (const s of allEntries(dict)) if (s.id === id) return s;
	return undefined;
};

const findByLabel = (dict: SymbolDict, ns: string, label: string) => {
	for (const s of allEntries(dict)) if (s.ns === ns && s.label === label) return s;
	return undefined;
};

const removeEntry = (dict: Ref<SymbolDict>, s: SymbolEntry) => {
	const byNs = dict.value[s.addr];
	if (!byNs || byNs[s.ns]?.id !== s.id) return;
	delete byNs[s.ns];
	if (Object.keys(byNs).length === 0) delete dict.value[s.addr];
};

const assertName = (what: string, value: string, re = NAME_RE) => {
	if (!re.test(value)) throw new Error(`Invalid ${what} name "${value}"`);
};

/**
 * Parses both symbol text formats:
 * - LABELS scripts, as written by the Symbol Manager export:
 *     LABELS <ns> [<scope>] / $ADDR label / END_LABELS
 * - legacy .sym files:
 *     NS [scope=x]: / LABEL: number = $ADDR ;source
 */
export const parseSymbolsText = (text: string): StoredSymbol[] => {
	const symbols: StoredSymbol[] = [];
	let ns = "user";
	let scope = "main";
	let inLabelsBlock = false;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;

		const labelsHeader = line.match(/^LABELS\s+(\S+)(?:\s+(\S+))?$/i);
		if (labelsHeader) {
			ns = labelsHeader[1]!;
			scope = labelsHeader[2] ?? "main";
			inLabelsBlock = true;
			continue;
		}
		if (/^END_LABELS$/i.test(line)) {
			inLabelsBlock = false;
			continue;
		}
		if (inLabelsBlock) {
			// Range attributes ([noindex]) belong to the machine, not to a disk: only the labels are imported
			const parsed = parseLabelsLine(line);
			if (typeof parsed !== "string" && parsed.label) symbols.push(labelsLineToSymbol(parsed, ns, scope));
			continue;
		}

		// Legacy .sym: namespace header in column 0: NAMESPACE: or 'NAMESPACE': or NAMESPACE [scope=x]:
		const nsMatch = rawLine.match(/^(['"]?)([\w%]+)\1(?:\s*\[(.*)\])?:\s*$/);
		if (nsMatch) {
			ns = nsMatch[2]!;
			scope = nsMatch[3]?.match(/SCOPE=([^\]\s]+)/i)?.[1] ?? "main";
			continue;
		}
		// Legacy .sym: symbol line, indented:   LABEL: number = $HEX ;source
		const symMatch = rawLine.match(/^\s+(\w+):\s+number\s+=\s+\$([0-9A-Fa-f]+)\s*(?:;(.*))?$/);
		if (symMatch)
			symbols.push({
				ns,
				scope,
				label: symMatch[1]!,
				addr: parseInt(symMatch[2]!, 16),
				src: symMatch[3]?.trim() ?? "",
			});
	}
	return symbols;
};

/** The symbol of a LABELS line that has a label; a range gives it a size */
export const labelsLineToSymbol = (line: LabelsLine, ns: string, scope: string): StoredSymbol => ({
	ns,
	scope,
	label: line.label!,
	addr: line.start,
	src: "",
	...(line.end !== undefined && { size: line.end - line.start + 1 }),
});

/** The scopes to search, in order: the given path, or the given scope followed by the SCOPEPATH */
const resolveScopePath = (scopeOrPath?: string | string[]) =>
	Array.isArray(scopeOrPath) ? scopeOrPath : ([scopeOrPath, ...scopeSearchPath.value].filter(Boolean) as string[]);

/** Symbols with a size, for the ones covering an address beyond the lookback window */
const sizedSymbols = computed(() =>
	[...allEntries(systemDict.value), ...allEntries(diskDict.value)].filter((s) => s.size !== undefined),
);

export function useSymbols() {
	const setDiskKey = (newKey: string) => {
		symbolDiskKey.value = newKey;
		// The system set: no disk (as at startup), so no disk entries either.
		if (newKey === SYSTEM_DISK) diskDict.value = {};
		return store.enqueue(() => loadDisk(newKey)).then(() => undefined);
	};

	/** Reloads the system symbols and the current disk's symbols from storage */
	const reloadSymbols = () =>
		store.enqueue(async () => {
			await loadDisk(SYSTEM_DISK);
			if (symbolDiskKey.value !== SYSTEM_DISK) await loadDisk(symbolDiskKey.value);
		});

	const setScopeSearchPath = (path: string[]) => {
		scopeSearchPath.value = path;
	};

	const initSymbols = async (machineName: string, newSymbols?: SymbolDict) => {
		store.setMachine(machineName);
		activeNamespaces.value.clear();
		addressRanges.value = [];
		symbolDiskKey.value = SYSTEM_DISK;
		diskDict.value = {};

		await store.enqueue(async () => {
			const stored = await loadDisk(SYSTEM_DISK);
			if (stored || !newSymbols) {
				console.log(`Symbols: Found ${stored?.length ?? 0} System symbols.`);
				return;
			}

			console.log("Symbols: Creating system symbols...");
			const dict: SymbolDict = {};
			for (const [addrStr, namespaces] of Object.entries(newSymbols)) {
				for (const [ns, data] of Object.entries(namespaces)) {
					const addr = Number(addrStr);
					(dict[addr] ??= {})[ns] = makeEntry(SYSTEM_DISK, { ...data, ns, addr });
					registerNamespace(ns);
				}
			}
			systemDict.value = dict;
			await persist(SYSTEM_DISK);
		});
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

					if (!labelQuery || entry.label.toUpperCase().startsWith(labelQuery)) {
						results.push(entry);
						continue;
					}

					if (isHex) {
						const addrStr = toHex(entry.addr, 0);
						if (addrStr.startsWith(hexQuery)) results.push(entry);
					}
				}
			}
		};

		searchInDict(systemDict.value);
		searchInDict(diskDict.value);

		return results;
	};

	const getSymbolsInRange = (start: number, end: number, namespace = "") => {
		const nsQuery = namespace.toUpperCase();
		const results: SymbolEntry[] = [];

		const searchInDict = (dict: SymbolDict) => {
			for (const namespaces of Object.values(dict)) {
				if (!namespaces) continue;
				for (const ns in namespaces) {
					if (nsQuery && ns.toUpperCase() !== nsQuery) continue;
					const entry = namespaces[ns];
					if (entry && entry.addr >= start && entry.addr <= end) results.push(entry);
				}
			}
		};

		searchInDict(systemDict.value);
		searchInDict(diskDict.value);
		return results.sort((a, b) => a.addr - b.addr);
	};

	const addSymbol = async (address: number, label: string, namespace = "user", scope = "main") => {
		assertName("label", label);
		assertName("namespace", namespace);
		assertName("scope", scope);

		await store.ready();
		const disk = symbolDiskKey.value;
		const dict = dictFor(disk);

		const existing = findByLabel(dict.value, namespace, label);
		if (existing && existing.addr !== address)
			throw new Error(
				`Label "${label}" already exists in namespace "${namespace}" at $${toHex(existing.addr, 4)}`,
			);

		const entry = makeEntry(disk, { ns: namespace, label, addr: address, scope, src: "" });
		if (!dict.value[address]) dict.value[address] = {};
		dict.value[address]![namespace] = entry;
		registerNamespace(namespace);

		await persist(disk);
		return entry.id!;
	};

	/**
	 * Adds or replaces symbols on the current disk, in one write.
	 * There is one symbol per (address, namespace), and a label is unique within its namespace:
	 * redefining an existing label moves it to the new address.
	 */
	const upsertMany = async (items: StoredSymbol[]) => {
		if (items.length === 0) return;

		await store.ready();
		const disk = symbolDiskKey.value;
		const target = dictFor(disk);

		// Copy-on-write, so the reactive dict is replaced once instead of triggering on every symbol
		const dict: SymbolDict = { ...target.value };
		const copied = new Set<number>();
		const slot = (addr: number) => {
			if (!copied.has(addr)) {
				dict[addr] = { ...dict[addr] };
				copied.add(addr);
			}
			return dict[addr]!;
		};
		const labelKey = (s: StoredSymbol) => `${s.ns}\0${s.label}`;
		const byLabel = new Map<string, SymbolEntry>();
		for (const s of allEntries(dict)) byLabel.set(labelKey(s), s);

		for (const item of items) {
			const previous = byLabel.get(labelKey(item));
			if (previous && previous.addr !== item.addr && slot(previous.addr)[previous.ns]?.id === previous.id)
				delete slot(previous.addr)[previous.ns];

			const atAddr = slot(item.addr);
			const replaced = atAddr[item.ns];
			if (replaced) byLabel.delete(labelKey(replaced));

			const entry = makeEntry(disk, item);
			atAddr[item.ns] = entry;
			byLabel.set(labelKey(entry), entry);
			registerNamespace(item.ns);
		}
		for (const addr of copied) if (Object.keys(dict[addr]!).length === 0) delete dict[addr];

		target.value = dict;
		await persist(disk);
	};

	const addManySymbols = async (symbols: Omit<SymbolEntry, "id" | "disk" | "src">[]) => {
		symbols.forEach((entry, i) => {
			if (!NAME_RE.test(entry.label)) throw new Error(`Invalid label name ${i} "${entry.label}"`);
			if (!NAME_RE.test(entry.scope)) throw new Error(`Invalid scope name ${i} "${entry.scope}"`);
			if (!NAME_RE.test(entry.ns)) throw new Error(`Invalid namespace name ${i} "${entry.ns}"`);
		});
		await upsertMany(symbols.map((s) => ({ ...s, src: "" })));
	};

	const updateSymbol = async (id: number, address: number, label: string, namespace: string, scope: string) => {
		assertName("label", label, /^:?[A-Za-z_][A-Za-z_0-9]*/);
		assertName("namespace", namespace);
		assertName("scope", scope);

		await store.ready();
		const current = findById(id);
		if (!current) return;

		const disk = current.disk;
		const dict = dictFor(disk);

		const clash = findByLabel(dict.value, namespace, label);
		if (clash && clash.id !== id && clash.addr !== address)
			throw new Error(`Label "${label}" already exists in namespace "${namespace}" at $${toHex(clash.addr, 4)}`);

		removeEntry(dict, current);
		if (!dict.value[address]) dict.value[address] = {};
		dict.value[address]![namespace] = makeEntry(
			disk,
			{ ns: namespace, label, addr: address, scope, src: current.src, size: current.size },
			id,
		);
		registerNamespace(namespace);

		await persist(disk);
	};

	const removeSymbol = async (id: number) => {
		await store.ready();
		const current = findById(id);
		if (!current) return;

		removeEntry(dictFor(current.disk), current);
		await persist(current.disk);
	};

	const removeManySymbols = async (ids: Set<number>) => {
		if (ids.size === 0) return;

		await store.ready();
		const touchedDisks = new Set<string>();
		for (const target of [systemDict, diskDict]) {
			const dict: SymbolDict = {};
			let changed = false;
			for (const [addr, byNs] of Object.entries(target.value)) {
				const kept: Record<string, SymbolEntry> = {};
				for (const [ns, s] of Object.entries(byNs)) {
					if (s.id !== undefined && ids.has(s.id)) {
						changed = true;
						touchedDisks.add(s.disk);
					} else kept[ns] = s;
				}
				if (Object.keys(kept).length) dict[Number(addr)] = kept;
			}
			if (changed) target.value = dict;
		}
		await Promise.all(Array.from(touchedDisks, persist));
	};

	const generateAsmSymFile = (): string => {
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

	const generateLabelsCommand = (): string => {
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

			const scopeSuffix = scope && scope !== "main" ? ` ${scope}` : "";
			output += `LABELS ${ns}${scopeSuffix}\n`;
			for (const sym of entries) {
				const end = sym.size !== undefined ? `:$${toHex(sym.addr + sym.size - 1, 4)}` : "";
				output += `  $${toHex(sym.addr, 4)}${end} ${sym.label}\n`;
			}
			output += "END_LABELS\n\n";
		}
		return output.trim();
	};

	/** Imports a LABELS script (as exported) or a legacy .sym file into the current disk */
	const addSymbolsFromText = (text: string) => upsertMany(parseSymbolsText(text));

	const getSymbolForAddress = (address: number, scopeOrPath?: string | string[]) => {
		const finalPath = resolveScopePath(scopeOrPath);

		const search = (dict: SymbolDict) => {
			const namespaces = dict[address];
			if (!namespaces) return undefined;

			for (const scope of finalPath) {
				for (const ns in namespaces) {
					if (!activeNamespaces.value.get(ns)) continue;
					const sym = namespaces[ns];
					if (sym?.scope === scope) {
						return sym; // Found a match in the current priority scope
					}
				}
			}
			return undefined; // Nothing found in the specified path
		};
		return search(diskDict.value) ?? search(systemDict.value);
	};

	const getLabelForAddress = (address: number, scopeOrPath?: string | string[]) => {
		return getSymbolForAddress(address, scopeOrPath)?.label;
	};

	const getLabelAtOrBefore = (address: number, scopeOrPath?: string | string[]): string | null => {
		// Collect all unique addresses from both dictionaries
		const addresses = new Set([
			...Object.keys(systemDict.value).map(Number),
			...Object.keys(diskDict.value).map(Number),
		]);

		// Filter for addresses at or before the target, and sort descending
		const candidates = Array.from(addresses)
			.filter((a) => a <= address)
			.sort((a, b) => b - a);

		// Iterate through candidates and return the first one that yields a valid label in scope
		for (const addr of candidates) {
			const label = getLabelForAddress(addr, scopeOrPath);
			if (label) return label;
		}
		return null;
	};

	/**
	 * The label of an address, as `label` (offset 0) or `label+offset`: the nearest label at or before it,
	 * inside its size when it has one, or within `maxLookback` bytes when it has none.
	 * Never a label after the address (no negative offset).
	 */
	const findSymbolWithOffset = (
		address: number,
		scopeOrPath?: string | string[],
		maxLookback = 16,
	): { symbol: SymbolEntry; offset: number } | null => {
		const sym = getSymbolForAddress(address, scopeOrPath);
		if (sym) return { symbol: sym, offset: 0 };

		for (let i = 1; i <= maxLookback && address - i >= 0; i++) {
			const found = getSymbolForAddress(address - i, scopeOrPath);
			if (found && (found.size === undefined || i < found.size)) return { symbol: found, offset: i };
		}

		// A sized label further away than the window, covering the address
		let best: SymbolEntry | undefined;
		for (const s of sizedSymbols.value) {
			if (s.addr >= address - maxLookback || address >= s.addr + s.size!) continue;
			if (best && s.addr <= best.addr) continue;
			// The visible symbol there: the namespace may be off, or another scope may come first
			const visible = getSymbolForAddress(s.addr, scopeOrPath);
			if (visible?.size !== undefined && address < visible.addr + visible.size) best = visible;
		}
		return best ? { symbol: best, offset: address - best.addr } : null;
	};

	/** Declares attribute ranges (LABELS `$START:$END [flags]`); a range declared again gets the new flags */
	const addAddressRanges = (ranges: AddressRange[]) => {
		const list = addressRanges.value.filter(
			(r) => !ranges.some((n) => n.ns === r.ns && n.scope === r.scope && n.start === r.start && n.end === r.end),
		);
		for (const r of ranges) {
			list.push(r);
			registerNamespace(r.ns);
		}
		addressRanges.value = list;
	};

	/** Whether an address is in a range with this flag, for an active namespace and a scope of the path */
	const hasRangeFlag = (address: number, flag: RangeFlag, scopeOrPath?: string | string[]) => {
		if (addressRanges.value.length === 0) return false;
		const path = resolveScopePath(scopeOrPath);
		return addressRanges.value.some(
			(r) =>
				address >= r.start &&
				address <= r.end &&
				r.flags.includes(flag) &&
				activeNamespaces.value.get(r.ns) &&
				path.includes(r.scope),
		);
	};

	const getAddressForLabel = (label: string, namespace = "") => {
		const upperSymbol = label.toUpperCase();
		const search = (dict: SymbolDict) => {
			for (const addressStr in dict) {
				const address = parseInt(addressStr, 10);
				const namespaces = dict[address];
				if (!namespaces) continue;
				for (const ns in namespaces) {
					if (namespace && ns.toUpperCase() !== namespace.toUpperCase()) continue;
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
		reloadSymbols,
		setDiskKey,

		setScopeSearchPath,
		scopeSearchPath: readonly(scopeSearchPath),
		generateLabelsCommand,

		addSymbolsFromText,
		generateAsmSymFile,

		getLabelForAddress,
		getLabelAtOrBefore,
		getSymbolForAddress,
		findSymbolWithOffset,
		getAddressForLabel,
		addAddressRanges,
		hasRangeFlag,

		getNamespaceList,
		toggleNamespace,

		addSymbol,
		addManySymbols,
		removeSymbol,
		removeManySymbols,
		updateSymbol,
		getSymbolsInRange,
		findSymbols,

		symbolsState,
		symbolDiskKey,
	};
}
