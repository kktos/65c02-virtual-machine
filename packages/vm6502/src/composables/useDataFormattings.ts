import { openDB, type DBSchema } from "idb";
import { computed, ref } from "vue";

export type DataType = "code" | "byte" | "word" | "string";

export interface DataBlock {
	id?: number;
	disk: string;
	address: number;
	type: DataType;
	length: number;
	group: string;
}

export type FormattingDict = Record<number, Record<string, DataBlock>>;

interface MetadataDB extends DBSchema {
	datablocks: {
		key: number;
		value: DataBlock;
		indexes: {
			"by-disk": [string];
		};
	};
}

// Global state for formatting rules
const activeFormattingGroups = ref<Map<string, boolean>>(new Map());
const systemRules = ref<FormattingDict>({});
const diskRules = ref<FormattingDict>({});

const formattingState = computed(() => ({
	dictA: systemRules.value,
	dictB: diskRules.value,
	activeGroups: activeFormattingGroups.value,
}));

const DB_NAME = "vm6502_metadata";
let diskKey = ref("");
let storeName = "";

export function useFormatting() {
	const setDiskKey = (newKey: string) => {
		diskKey.value = newKey;
		loadFormatsFromDb();
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
				if (!db.objectStoreNames.contains(storeName as any)) {
					const store = db.createObjectStore(storeName as unknown as "datablocks", {
						keyPath: "id",
						autoIncrement: true,
					});
					store.createIndex("by-disk", ["disk"]);
				}
			},
			blocked(_currentVersion, _blockedVersion, _event) {
				console.error(`Db ${DB_NAME} blocked`);
			},
		});
		return db;
	};

	const loadFormatsFromDb = async () => {
		if (!diskKey.value) return;
		try {
			const db = await getDb();
			const tx = db.transaction(storeName as unknown as "datablocks", "readonly");
			const index = tx.store.index("by-disk");

			const foundGroups = new Set<string>();
			const newDiskDict: FormattingDict = {};
			const diskFormats = await index.getAll([diskKey.value]);
			for (const fmt of diskFormats) {
				if (!newDiskDict[fmt.address]) newDiskDict[fmt.address] = {};
				newDiskDict[fmt.address]![fmt.group] = fmt;
				foundGroups.add(fmt.group);
			}

			const targetDict = diskKey.value === "*" ? systemRules : diskRules;
			targetDict.value = newDiskDict;

			for (const group of foundGroups)
				if (!activeFormattingGroups.value.has(group)) activeFormattingGroups.value.set(group, true);
		} catch (e) {
			console.error("Failed to load formatting rules", e);
		}
	};

	const initFormats = async (machineName: string, newFormats?: FormattingDict) => {
		storeName = `${machineName.replace(/ /g, "_").toLowerCase()}_datablocks`;
		activeFormattingGroups.value.clear();

		if (!newFormats) return;

		diskKey.value = "*";
		const db = await getDb();
		const tx = db.transaction(storeName as unknown as "datablocks", "readwrite");
		const index = tx.store.index("by-disk");
		const count = await index.count([diskKey.value]);
		if (count) {
			console.log(`Formatting: Found ${count} System formats in DB.`);
			await loadFormatsFromDb();
			return;
		}

		console.log("Formatting: Creating system formats in DB...");

		const keys = await index.getAllKeys([diskKey.value]);
		await Promise.all(keys.map((key) => tx.store.delete(key)));

		const promises: Promise<IDBValidKey>[] = [];
		const newDict: FormattingDict = {};

		for (const [addrStr, groups] of Object.entries(newFormats)) {
			for (const [group, data] of Object.entries(groups)) {
				const address = Number(addrStr);
				const block: DataBlock = {
					disk: diskKey.value,
					group,
					address,
					type: data.type,
					length: data.length,
				};
				promises.push(
					tx.store.add(block).then((id) => {
						const b = { ...block, id: Number(id) };
						if (!newDict[address]) newDict[address] = {};
						newDict[address][group] = b;
						return id;
					}),
				);
				if (!activeFormattingGroups.value.has(group)) activeFormattingGroups.value.set(group, true);
			}
		}
		await Promise.all(promises);
		await tx.done;
		systemRules.value = newDict;
	};

	const findFormattings = (query: string, group = "") => {
		const groupQuery = group.toUpperCase();

		// Prepare address query
		const hexQuery = query.replace(/^(\$|0x)/i, "").toUpperCase();
		const results: DataBlock[] = [];
		const searchInDict = (dict: FormattingDict) => {
			for (const groups of Object.values(dict)) {
				if (!groups) continue;
				for (const grp in groups) {
					if (groupQuery && grp.toUpperCase() !== groupQuery) continue;
					const entry = groups[grp];
					if (!entry) continue;

					const addrStr = entry.address.toString(16).toUpperCase().padStart(4, "0");
					if (addrStr.startsWith(hexQuery)) results.push(entry);
				}
			}
		};

		searchInDict(systemRules.value);
		searchInDict(diskRules.value);

		return results;
	};

	const addFormatting = async (address: number, type: DataType, length: number, group = "user") => {
		const db = await getDb();
		const block: DataBlock = {
			disk: diskKey.value,
			group,
			address,
			type,
			length,
		};
		const id = await db.add(storeName as unknown as "datablocks", block);

		const newBlock = { ...block, id: Number(id) };
		const targetDict = diskKey.value === "*" ? systemRules : diskRules;
		if (!targetDict.value[address]) targetDict.value[address] = {};
		targetDict.value[address][group] = newBlock;

		if (!activeFormattingGroups.value.has(group)) activeFormattingGroups.value.set(group, true);
		return id;
	};

	const removeFormat = async (address: number, group = "user") => {
		const targetDict = diskKey.value === "*" ? systemRules : diskRules;
		const rule = targetDict.value[address]?.[group];
		if (!rule || !rule.id) return;

		const db = await getDb();
		await db.delete(storeName as unknown as "datablocks", rule.id);

		const entry = targetDict.value[address];
		if (entry) {
			delete entry[group];
			if (Object.keys(entry).length === 0) delete targetDict.value[address];
		}
	};

	const getFormat = (address: number) => {
		const search = (dict: FormattingDict) => {
			const map = dict[address];
			if (!map) return undefined;
			for (const group in map) {
				if (!activeFormattingGroups.value.get(group)) continue;
				return map[group];
			}
			return undefined;
		};
		return search(diskRules.value) ?? search(systemRules.value);
	};

	const addFormattingsFromText = async (text: string) => {
		const db = await getDb();
		const tx = db.transaction(storeName as unknown as "datablocks", "readwrite");
		const lines = text.split(/\r?\n/);
		let currentGroup = "user";

		// Matches: '%% DATA: groupname %%':
		const headerRegex = /^'%% DATA:\s*(.+) %%':/;
		const dataRegex = /^\s*([0-9A-Fa-f]+):\s*(code|byte|word|string)\[(\d+)\]/;

		const promises: Promise<void>[] = [];

		for (const line of lines) {
			const headerMatch = line.match(headerRegex);
			if (headerMatch) {
				currentGroup = headerMatch[1] ? headerMatch[1].trim() : "user";
				if (!activeFormattingGroups.value.has(currentGroup))
					activeFormattingGroups.value.set(currentGroup, true);
				continue;
			}

			const dataMatch = line.match(dataRegex) as [unknown, string, DataType, string];
			if (dataMatch) {
				const address = parseInt(dataMatch[1], 16);
				const type = dataMatch[2];
				let length = parseInt(dataMatch[3], 10);
				if (type === "word") length *= 2;

				const block: DataBlock = {
					disk: diskKey.value,
					group: currentGroup,
					address,
					type,
					length,
				};

				promises.push(
					tx.store.add(block).then((id) => {
						const b = { ...block, id: Number(id) };
						const targetDict = diskKey.value === "*" ? systemRules : diskRules;
						if (!targetDict.value[address]) targetDict.value[address] = {};
						targetDict.value[address][currentGroup] = b;
					}),
				);
			}
		}
		await Promise.all(promises);
		await tx.done;
	};

	const generateTextFromFormattings = (): string => {
		const groups = new Map<string, DataBlock[]>();

		// Group all data blocks by their group name from diskRules
		for (const blocksAtAddress of Object.values(diskRules.value)) {
			for (const block of Object.values(blocksAtAddress)) {
				if (!groups.has(block.group)) {
					groups.set(block.group, []);
				}
				groups.get(block.group)!.push(block);
			}
		}

		if (groups.size === 0) return "";

		let output = "";
		const sortedGroupNames = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

		for (const groupName of sortedGroupNames) {
			const blocks = groups.get(groupName)!;
			blocks.sort((a, b) => a.address - b.address);

			output += `'%% DATA: ${groupName} %%':\n`;

			for (const block of blocks) {
				const addressHex = block.address.toString(16).toUpperCase().padStart(4, "0");
				let len = block.length;
				if (block.type === "word") len /= 2;
				output += `  ${addressHex}: ${block.type}[${len}]\n`;
			}
			output += "\n";
		}
		return output;
	};

	const getFormattingGroups = () => Array.from(activeFormattingGroups.value.entries());
	const toggleFormattingGroup = (group: string) => {
		const current = activeFormattingGroups.value.get(group);
		activeFormattingGroups.value.set(group, !current);
	};

	return {
		setDiskKey,
		initFormats,
		formattingState,
		activeFormattingGroups,

		addFormatting,
		removeFormat,
		findFormattings,

		getFormat,

		addFormattingsFromText,
		generateTextFromFormattings,

		getFormattingGroups,
		toggleFormattingGroup,
		diskKey,
	};
}
