import { openDB } from "idb";
import { loadMetadata, saveMetadata, type MetadataKind } from "@/lib/metadataStore";

/**
 * One-shot copy of the data stored by previous versions of the app.
 *
 * The legacy database held one object store per machine and kind ("<machine>_symbols",
 * "<machine>_datablocks", "<machine>_notes"), one record per item, tagged with its disk.
 * It is opened read-only: it is never written to, upgraded or deleted.
 */
export const LEGACY_DB_NAME = "vm6502_metadata";

type LegacyRecord = Record<string, unknown>;
type Item = Record<string, unknown>;

type Converter = {
	toItem: (r: LegacyRecord) => Item | undefined;
	/** Identity keys: an imported item is skipped when one of them is already taken */
	keys: (item: Item) => string[];
};

const isNum = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

const CONVERTERS: Record<MetadataKind, Converter> = {
	symbols: {
		toItem: (r) =>
			isNum(r.addr) && r.label && r.ns
				? { ns: str(r.ns), label: str(r.label), addr: r.addr, scope: str(r.scope) || "main", src: str(r.src) }
				: undefined,
		keys: (s) => [`addr:${s.addr}:${s.ns}`, `label:${s.ns}:${s.label}`],
	},
	formats: {
		toItem: (r) =>
			isNum(r.address) && isNum(r.length) && r.type
				? { address: r.address, type: r.type, length: r.length, group: str(r.group) || "user" }
				: undefined,
		keys: (f) => [`${f.address}:${f.group}`],
	},
	notes: {
		toItem: (r) =>
			isNum(r.addr) && typeof r.note === "string"
				? { addr: r.addr, scope: str(r.scope) || "main", note: r.note }
				: undefined,
		keys: (n) => [`${n.scope}:${n.addr}`],
	},
};

const LEGACY_STORE_KINDS: Record<string, MetadataKind> = {
	symbols: "symbols",
	datablocks: "formats",
	notes: "notes",
};

export type LegacyImportReport = {
	found: boolean;
	machines: string[];
	disks: number;
	added: Record<MetadataKind, number>;
	/** Legacy items not imported because the current storage already has an entry for them */
	skipped: number;
};

const legacyDbExists = async () => {
	// Opening a database that does not exist would create it: check first when the browser allows it
	if (typeof indexedDB.databases !== "function") return true;
	const dbs = await indexedDB.databases();
	return dbs.some((db) => db.name === LEGACY_DB_NAME);
};

export async function importLegacyMetadata(): Promise<LegacyImportReport> {
	const report: LegacyImportReport = {
		found: false,
		machines: [],
		disks: 0,
		added: { symbols: 0, formats: 0, notes: 0 },
		skipped: 0,
	};
	if (!(await legacyDbExists())) return report;

	// No version given: opens the existing database as is, without any upgrade
	const legacyDb = await openDB(LEGACY_DB_NAME);
	try {
		const machines = new Set<string>();

		for (const storeName of Array.from(legacyDb.objectStoreNames)) {
			const match = storeName.match(/^(.+)_(symbols|datablocks|notes)$/);
			if (!match) continue;
			const machine = match[1]!;
			const kind = LEGACY_STORE_KINDS[match[2]!]!;
			const converter = CONVERTERS[kind];

			// getAll returns records by ascending id: on duplicates, the most recent one wins
			const records = (await legacyDb.getAll(storeName)) as LegacyRecord[];
			const byDisk = new Map<string, Map<string, Item>>();
			for (const record of records) {
				const item = converter.toItem(record);
				if (!item) continue;
				const disk = String(record.disk ?? "*");
				if (!byDisk.has(disk)) byDisk.set(disk, new Map());
				byDisk.get(disk)!.set(converter.keys(item)[0]!, item);
			}
			if (byDisk.size === 0) continue;

			report.found = true;
			machines.add(machine);

			for (const [disk, legacyItems] of byDisk) {
				const existing = (await loadMetadata<Item>(machine, kind, disk)) ?? [];
				const taken = new Set(existing.flatMap(converter.keys));
				const added = Array.from(legacyItems.values()).filter((item) => {
					const keys = converter.keys(item);
					if (keys.some((k) => taken.has(k))) return false;
					for (const k of keys) taken.add(k);
					return true;
				});

				report.disks++;
				report.skipped += legacyItems.size - added.length;
				if (added.length === 0) continue;

				await saveMetadata(machine, kind, disk, [...existing, ...added]);
				report.added[kind] += added.length;
			}
		}

		report.machines = Array.from(machines).sort();
	} finally {
		legacyDb.close();
	}
	return report;
}
