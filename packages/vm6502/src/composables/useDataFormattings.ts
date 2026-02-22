import { openDB, type DBSchema } from "idb";
import { ref } from "vue";
import type { SymbolDict } from "./useSymbols";

export type DataType = "code" | "byte" | "word" | "string";

export interface DataBlock {
	id?: number;
	disk: string;
	address: number;
	type: DataType;
	length: number;
	group?: string;
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
// Address -> Group -> DataBlock
const activeFormattingGroups = ref<Map<string, boolean>>(new Map());
const systemRules = ref<Map<number, Map<string, DataBlock>>>(new Map());
const diskRules = ref<Map<number, Map<string, DataBlock>>>(new Map());

const DB_NAME = "vm6502_metadata";
const DB_VERSION = 1;
let diskKey: string;
let storeName = "";

export function useFormatting() {
	const setDiskKey = (newKey: string) => {
		diskKey = newKey;
		loadSymbolsFromDb();
	};

	const getDb = async () => {
		if (!diskKey) throw new Error("No disk key provided");
		if (!storeName) throw new Error("No store name provided");

		const db = await openDB<MetadataDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				const store = db.createObjectStore(storeName as unknown as "datablocks", {
					keyPath: "id",
					autoIncrement: true,
				});
				store.createIndex("by-disk", ["disk"]);
			},
		});
		return db;
	};

	const loadSymbolsFromDb = async () => {
		if (!diskKey) return;
		try {
			const db = await getDb();
			const tx = db.transaction(storeName as unknown as "datablocks", "readonly");
			const index = tx.store.index("by-disk");

			const foundNamespaces = new Set<string>();
			const newDiskDict: SymbolDict = {};
			const diskSymbols = await index.getAll([diskKey]);
			for (const sym of diskSymbols) {
				if (!newDiskDict[sym.addr]) newDiskDict[sym.addr] = {};
				newDiskDict[sym.addr]![sym.ns] = sym;
				foundNamespaces.add(sym.ns);
			}

			const targetDict = diskKey === "*" ? systemRules : diskRules;
			targetDict.value = newDiskDict;

			for (const ns of foundNamespaces)
				if (!activeFormattingGroups.value.has(ns)) activeFormattingGroups.value.set(ns, true);
		} catch (e) {
			console.error("Failed to load symbols", e);
		}
	};

	const initFormats = (newFormats?: FormattingDict) => {
		formattingRules.value.clear();
		activeFormattingGroups.value.clear();
		if (newFormats) {
			for (const [addrStr, groups] of Object.entries(newFormats)) {
				const address = Number(addrStr);
				for (const [group, block] of Object.entries(groups))
					addFormat(address, block.type, block.length, group);
			}
		}
	};

	const activateGroup = (group: string) => {
		if (!activeFormattingGroups.value.has(group)) activeFormattingGroups.value.set(group, true);
	};

	const addFormat = (address: number, type: DataType, length: number, group = "user") => {
		if (!formattingRules.value.has(address)) formattingRules.value.set(address, new Map());
		// biome-ignore lint/style/noNonNullAssertion: <we just set it before>
		const addrMap = formattingRules.value.get(address)!;
		addrMap.set(group, { address, type, length, group });
		activateGroup(group);
	};

	const addFormatting = (newRules: FormattingDict) => {
		for (const [addrStr, groups] of Object.entries(newRules)) {
			const address = Number(addrStr);
			for (const [group, block] of Object.entries(groups)) addFormat(address, block.type, block.length, group);
		}
	};

	const removeFormat = (address: number, group = "user") => {
		const addrMap = formattingRules.value.get(address);
		if (addrMap) {
			addrMap.delete(group);
			if (addrMap.size === 0) formattingRules.value.delete(address);
		}
	};

	const getFormat = (address: number) => {
		const addrMap = formattingRules.value.get(address);
		if (!addrMap) return undefined;

		// Priority: 'user' > others
		if (activeFormattingGroups.value.get("user") && addrMap.has("user")) return addrMap.get("user");

		for (const [group, isActive] of activeFormattingGroups.value) {
			if (isActive && addrMap.has(group)) return addrMap.get(group);
		}
		return undefined;
	};

	const setFormatting = (rules: Record<string, DataBlock> | undefined) => {
		// Clear user group
		for (const [addr, map] of formattingRules.value) {
			map.delete("user");
			if (map.size === 0) formattingRules.value.delete(addr);
		}

		if (!rules) return;
		for (const [key, value] of Object.entries(rules)) {
			addFormat(Number(key), value.type, value.length, "user");
		}
	};

	const getFormatting = () => {
		const result: Record<number, DataBlock> = {};
		for (const [addr, map] of formattingRules.value) {
			const datablock = map.get("user");
			if (datablock) result[addr] = datablock;
		}
		return result;
	};

	const parseFormattingFromText = (text: string): FormattingDict => {
		const result: FormattingDict = {};
		const lines = text.split(/\r?\n/);
		let currentGroup = "user";

		// Matches: '%% DATA: groupname %%':
		const headerRegex = /^'%% DATA:\s*(.+) %%':/;
		const dataRegex = /^\s*([0-9A-Fa-f]+):\s*(code|byte|word|string)\[(\d+)\]/;

		for (const line of lines) {
			const headerMatch = line.match(headerRegex);
			if (headerMatch) {
				currentGroup = headerMatch[1] ? headerMatch[1].trim() : "user";
				continue;
			}

			const dataMatch = line.match(dataRegex) as [string, string, DataType, string];
			if (dataMatch) {
				const address = parseInt(dataMatch[1], 16);
				const type = dataMatch[2];
				let length = parseInt(dataMatch[3], 10);
				if (type === "word") length *= 2;
				if (!result[address]) result[address] = {};
				result[address][currentGroup] = { address, type, length, group: currentGroup };
			}
		}
		return result;
	};

	const generateDataSymFileContent = (
		rules: Record<string, DataBlock> | Map<number, Map<string, DataBlock>>,
		groupName = "user",
	): string => {
		let rulesToExport: Record<string, DataBlock> = {};

		if (rules instanceof Map) {
			for (const [addr, map] of rules) {
				const datablock = map.get(groupName);
				if (datablock) rulesToExport[addr] = datablock;
			}
		} else {
			rulesToExport = rules;
		}

		if (Object.keys(rulesToExport).length === 0) return "";

		let content = `'%% DATA: ${groupName} %%':\n`;
		const sortedAddresses = Object.keys(rulesToExport)
			.map(Number)
			.sort((a, b) => a - b);
		for (const address of sortedAddresses) {
			const rule = rulesToExport[address] as DataBlock;
			const addressHex = address.toString(16).toUpperCase().padStart(4, "0");
			let len = rule.length;
			switch (rule.type) {
				case "word":
					len = len / 2;
					break;
			}
			content += `  ${addressHex}: ${rule.type}[${len}]\n`;
		}
		return content;
	};

	const getFormattingGroups = () => Array.from(activeFormattingGroups.value.entries());
	const toggleFormattingGroup = (group: string) => {
		const current = activeFormattingGroups.value.get(group);
		activeFormattingGroups.value.set(group, !current);
	};

	return {
		setDiskKey,
		initFormats,
		formattingRules,
		activeFormattingGroups,
		addFormat,
		addFormatting,
		removeFormat,
		getFormat,
		setFormatting,
		getFormatting,
		parseFormattingFromText,
		generateDataSymFileContent,
		getFormattingGroups,
		toggleFormattingGroup,
	};
}
