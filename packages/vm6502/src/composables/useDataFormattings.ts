import { toHex } from "@/lib/hex.utils";
import { createMetadataSync } from "@/lib/metadataStore";
import { computed, ref, type Ref } from "vue";

export type DataType = "code" | "byte" | "word" | "string";

export interface DataBlock {
	/** In-memory identity, assigned at load time; it is not persisted */
	id?: number;
	disk: string;
	address: number;
	type: DataType;
	length: number;
	group: string;
}

export type FormattingDict = Record<number, Record<string, DataBlock>>;
/** What is persisted: the disk is implied by the storage key */
export type StoredFormat = Omit<DataBlock, "id" | "disk">;

const SYSTEM_DISK = "*";
const FORMAT_TYPES: Record<string, DataType> = { b: "byte", w: "word", s: "string" };

// Global state for formatting rules
const activeFormattingGroups = ref<Map<string, boolean>>(new Map());
const systemRules = ref<FormattingDict>({});
const diskRules = ref<FormattingDict>({});

const formattingState = computed(() => ({
	dictA: systemRules.value,
	dictB: diskRules.value,
	activeGroups: activeFormattingGroups.value,
}));

const diskKey = ref("");
const store = createMetadataSync("formats");
let nextId = 1;

const rulesFor = (disk: string) => (disk === SYSTEM_DISK ? systemRules : diskRules);

const registerGroup = (group: string) => {
	if (!activeFormattingGroups.value.has(group)) activeFormattingGroups.value.set(group, true);
};

const makeBlock = (disk: string, f: StoredFormat, id = nextId++): DataBlock => ({
	id,
	disk,
	address: f.address,
	type: f.type,
	length: f.length,
	group: f.group,
});

function* allBlocks(dict: FormattingDict) {
	for (const byGroup of Object.values(dict)) if (byGroup) yield* Object.values(byGroup);
}

/** Saves the whole rule list of a disk; the snapshot is taken synchronously, as plain objects */
const persist = (disk: string) =>
	store.save<StoredFormat>(
		disk,
		Array.from(allBlocks(rulesFor(disk).value), ({ address, type, length, group }) => ({
			address,
			type,
			length,
			group,
		})),
	);

const loadDisk = async (disk: string) => {
	const items = await store.load<StoredFormat>(disk);
	const dict: FormattingDict = {};
	for (const f of items ?? []) {
		(dict[f.address] ??= {})[f.group] = makeBlock(disk, f);
		registerGroup(f.group);
	}
	rulesFor(disk).value = dict;
	return items;
};

/** Parses one FORMATS script line: `$ADDR b|w|s [count]`. Returns an error message when invalid. */
export const parseFormatsLine = (line: string): Omit<StoredFormat, "group"> | string => {
	const parts = line.trim().split(/\s+/) as string[];
	if (parts.length < 2) return `Invalid line "${line}"`;

	const address = parseInt(parts[0]!.replace(/^(0x|\$)/i, ""), 16);
	if (Number.isNaN(address)) return `Invalid address "${parts[0]}"`;

	const type = FORMAT_TYPES[parts[1]!.toLowerCase()];
	if (!type) return `Invalid type "${parts[1]}". Use w, b, or s.`;

	const count = parts[2] ? parseInt(parts[2], 10) : 1;
	if (Number.isNaN(count)) return `Invalid count "${parts[2]}"`;

	return { address, type, length: type === "word" ? count * 2 : count };
};

/**
 * Parses both formatting text formats (invalid lines are skipped):
 * - FORMATS scripts, as written by the Formatting Manager export:
 *     FORMATS [<group>] / $ADDR b|w|s [count] / END_FORMATS
 * - legacy files:
 *     '%% DATA: group %%': / ADDR: byte|word|string|code[count]
 */
export const parseFormattingsText = (text: string): StoredFormat[] => {
	const formats: StoredFormat[] = [];
	let group = "user";
	let inFormatsBlock = false;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;

		const formatsHeader = line.match(/^FORMATS(?:\s+(\S+))?$/i);
		if (formatsHeader) {
			group = formatsHeader[1] ?? "user";
			inFormatsBlock = true;
			continue;
		}
		if (/^END_FORMATS$/i.test(line)) {
			inFormatsBlock = false;
			continue;
		}
		if (inFormatsBlock) {
			const parsed = parseFormatsLine(line);
			if (typeof parsed !== "string") formats.push({ ...parsed, group });
			continue;
		}

		const legacyHeader = line.match(/^'%% DATA:\s*(.+) %%':/);
		if (legacyHeader) {
			group = legacyHeader[1]?.trim() || "user";
			continue;
		}
		const legacyData = line.match(/^([0-9A-Fa-f]+):\s*(code|byte|word|string)\[(\d+)\]/);
		if (legacyData) {
			const type = legacyData[2] as DataType;
			const count = parseInt(legacyData[3]!, 10);
			formats.push({
				address: parseInt(legacyData[1]!, 16),
				type,
				length: type === "word" ? count * 2 : count,
				group,
			});
		}
	}
	return formats;
};

export function useFormatting() {
	const setDiskKey = (newKey: string) => {
		diskKey.value = newKey;
		return store.enqueue(() => loadDisk(newKey)).then(() => undefined);
	};

	/** Reloads the system rules and the current disk's rules from storage */
	const reloadFormats = () =>
		store.enqueue(async () => {
			await loadDisk(SYSTEM_DISK);
			if (diskKey.value !== SYSTEM_DISK) await loadDisk(diskKey.value);
		});

	const initFormats = async (machineName: string, newFormats?: FormattingDict) => {
		store.setMachine(machineName);
		activeFormattingGroups.value.clear();
		diskKey.value = SYSTEM_DISK;
		diskRules.value = {};

		await store.enqueue(async () => {
			const stored = await loadDisk(SYSTEM_DISK);
			if (stored || !newFormats) {
				console.log(`Formatting: Found ${stored?.length ?? 0} System formats.`);
				return;
			}

			console.log("Formatting: Creating system formats...");
			const dict: FormattingDict = {};
			for (const [addrStr, groups] of Object.entries(newFormats)) {
				for (const [group, data] of Object.entries(groups)) {
					const address = Number(addrStr);
					(dict[address] ??= {})[group] = makeBlock(SYSTEM_DISK, { ...data, address, group });
					registerGroup(group);
				}
			}
			systemRules.value = dict;
			await persist(SYSTEM_DISK);
		});
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

					const addrStr = entry.address.toString(16).toUpperCase();
					if (addrStr.startsWith(hexQuery)) results.push(entry);
				}
			}
		};

		searchInDict(systemRules.value);
		searchInDict(diskRules.value);

		return results;
	};

	/** Adds a rule to the current disk, replacing any rule of the same group at that address */
	const addFormatting = async (address: number, type: DataType, length: number, group = "user") => {
		await store.ready();
		const disk = diskKey.value;
		const dict = rulesFor(disk);

		const block = makeBlock(disk, { address, type, length, group });
		if (!dict.value[address]) dict.value[address] = {};
		dict.value[address]![group] = block;
		registerGroup(group);

		await persist(disk);
		return block.id!;
	};

	/** Adds or replaces rules on the current disk, in one write */
	const addManyFormattings = async (formattings: StoredFormat[]) => {
		if (formattings.length === 0) return;

		await store.ready();
		const disk = diskKey.value;
		const target = rulesFor(disk);

		// Copy-on-write, so the reactive dict is replaced once instead of triggering on every rule
		const dict: FormattingDict = { ...target.value };
		const copied = new Set<number>();
		for (const f of formattings) {
			if (!copied.has(f.address)) {
				dict[f.address] = { ...dict[f.address] };
				copied.add(f.address);
			}
			dict[f.address]![f.group] = makeBlock(disk, f);
			registerGroup(f.group);
		}

		target.value = dict;
		await persist(disk);
	};

	const removeEntry = (dict: Ref<FormattingDict>, address: number, group: string) => {
		const byGroup = dict.value[address];
		if (!byGroup?.[group]) return false;
		delete byGroup[group];
		if (Object.keys(byGroup).length === 0) delete dict.value[address];
		return true;
	};

	/** Changes a rule in place: it stays on its disk, in its group, at its address */
	const updateFormatting = async (id: number, changes: Partial<Pick<DataBlock, "type" | "length">>) => {
		await store.ready();
		const current = [...allBlocks(systemRules.value), ...allBlocks(diskRules.value)].find((b) => b.id === id);
		if (!current) return;

		rulesFor(current.disk).value[current.address]![current.group] = { ...current, ...changes };
		await persist(current.disk);
	};

	const removeFormatting = async (address: number, group = "user") => {
		await store.ready();
		const disk = diskKey.value;
		if (removeEntry(rulesFor(disk), address, group)) await persist(disk);
	};

	const removeManyFormattings = async (ids: Set<number>) => {
		if (ids.size === 0) return;

		await store.ready();
		const touchedDisks = new Set<string>();
		for (const target of [systemRules, diskRules]) {
			const dict: FormattingDict = {};
			let changed = false;
			for (const [addr, byGroup] of Object.entries(target.value)) {
				const kept: Record<string, DataBlock> = {};
				for (const [group, block] of Object.entries(byGroup)) {
					if (block.id !== undefined && ids.has(block.id)) {
						changed = true;
						touchedDisks.add(block.disk);
					} else kept[group] = block;
				}
				if (Object.keys(kept).length) dict[Number(addr)] = kept;
			}
			if (changed) target.value = dict;
		}
		await Promise.all(Array.from(touchedDisks, persist));
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

	/** Imports a FORMATS script (as exported) or a legacy '%% DATA' file into the current disk */
	const addFormattingsFromText = (text: string) => addManyFormattings(parseFormattingsText(text));

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

	const generateFormatsCommand = (targetDisk?: string): string => {
		const groups = new Map<string, DataBlock[]>();
		const source = (targetDisk ?? diskKey.value) === "*" ? systemRules.value : diskRules.value;

		// Group all data blocks by their group name from selected source
		for (const blocksAtAddress of Object.values(source)) {
			for (const block of Object.values(blocksAtAddress)) {
				if (!groups.has(block.group)) groups.set(block.group, []);
				groups.get(block.group)!.push(block);
			}
		}

		if (groups.size === 0) return "";

		let output = "";
		const sortedGroupNames = Array.from(groups.keys()).sort();

		for (const groupName of sortedGroupNames) {
			const blocks = groups.get(groupName)!;
			blocks.sort((a, b) => a.address - b.address);

			const groupSuffix = groupName !== "user" ? ` ${groupName}` : "";
			output += `FORMATS${groupSuffix}\n`;

			for (const block of blocks) {
				let typeChar = "b";
				let count = block.length;

				if (block.type === "word") {
					typeChar = "w";
					count /= 2;
				} else if (block.type === "string") typeChar = "s";

				const addressHex = toHex(block.address, 4);
				output += `  $${addressHex} ${typeChar} ${count}\n`;
			}
			output += "END_FORMATS\n\n";
		}
		return output.trim();
	};

	const getFormattingGroups = () => Array.from(activeFormattingGroups.value.entries());
	const toggleFormattingGroup = (group: string) => {
		const current = activeFormattingGroups.value.get(group);
		activeFormattingGroups.value.set(group, !current);
	};

	return {
		setDiskKey,
		initFormats,
		reloadFormats,
		formattingState,
		activeFormattingGroups,

		addFormatting,
		addManyFormattings,
		updateFormatting,
		removeFormatting,
		removeManyFormattings,
		findFormattings,

		getFormat,

		addFormattingsFromText,
		generateTextFromFormattings,
		generateFormatsCommand,

		getFormattingGroups,
		toggleFormattingGroup,
		diskKey,
	};
}
