// The disk drive: what is inserted (from the library, a file or a URL), ejecting, and the disk put back at startup.
// Shared by the toolbar's DiskDriveControl and the MCP tools.

import { shallowReadonly, shallowRef } from "vue";
import { useFormatting } from "@/composables/useDataFormattings";
import { type StoredDisk, useDiskStorage } from "@/composables/useDiskStorage";
import { useNotes } from "@/composables/useNotes";
import { useSymbols } from "@/composables/useSymbols";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

// What is put back at startup: a URL disk, else a library disk; neither = empty drive.
const ACTIVE_DISK_KEY = "vm6502_active_disk_name";
const ACTIVE_DISK_URL_KEY = "vm6502_active_disk_url";
const SLOT = 5;
/** Metadata disk key with an empty drive: the system set, as at startup before any disk. */
const NO_DISK = "*";

/** Image files the drive takes (the SmartPort card: `.2mg` has a header, the others are raw blocks). */
export const DISK_EXTENSIONS = [".po", ".2mg", ".dsk", ".hdv"];

export type InsertedDisk = { key: IDBValidKey; name: string; size: number; type: StoredDisk["type"] };

const inserted = shallowRef<InsertedDisk | null>(null);

const remember = (disk: { type: "physical" | "url"; key: IDBValidKey } | null) => {
	try {
		localStorage.removeItem(ACTIVE_DISK_KEY);
		localStorage.removeItem(ACTIVE_DISK_URL_KEY);
		if (disk?.type === "physical") localStorage.setItem(ACTIVE_DISK_KEY, String(disk.key));
		if (disk?.type === "url") localStorage.setItem(ACTIVE_DISK_URL_KEY, String(disk.key));
	} catch {
		// storage unavailable: the disk just won't come back at startup
	}
};

const recalled = () => {
	try {
		return { url: localStorage.getItem(ACTIVE_DISK_URL_KEY), key: localStorage.getItem(ACTIVE_DISK_KEY) };
	} catch {
		return { url: null, key: null };
	}
};

/** File name from a URL: last path segment, without the query or fragment, percent-decoded ("%20" → " "). */
const urlFileName = (url: string) => {
	const raw = url.split(/[?#]/)[0].split("/").pop() ?? "";
	let name = raw;
	try {
		name = decodeURIComponent(raw);
	} catch {
		// malformed escape (a lone "%"): keep the name as written
	}
	if (!name.trim()) throw new Error("Invalid disk name");
	return name;
};

export function useDiskDrive() {
	const { saveDisk, saveUrlDisk, loadDisk, getAllDisks, deleteDisk, renameDisk } = useDiskStorage();
	const { addSymbolsFromText, setDiskKey: symbolsSetDiskKey } = useSymbols();
	const { setDiskKey: formattingsSetDiskKey } = useFormatting();
	const { setDiskKey: notesSetDiskKey } = useNotes();

	/** Labels, data formats and notes follow the disk. */
	const setMetadataDisk = async (key: string) => {
		await Promise.all([symbolsSetDiskKey(key), formattingsSetDiskKey(key), notesSetDiskKey(key)]);
	};

	/** `mediaName` is the file name: the card looks at its extension (`.2mg` has a header). */
	const insert = async (vm: VirtualMachine, disk: InsertedDisk, data: ArrayBuffer, mediaName: string) => {
		vm.insertDisk(new Uint8Array(data), { slot: SLOT, name: mediaName });
		inserted.value = disk;
		await loadDisk(disk.key); // the disk the explain prompt names (`lastLoadedDisk`)
		await setMetadataDisk(String(disk.key));
	};

	/** Fetches a URL disk and its `.sym` file if there is one (its symbols go to that disk). */
	const insertFromUrl = async (vm: VirtualMachine, url: string, name = urlFileName(url)) => {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Failed to load disk: ${response.statusText}`);
		const buffer = await response.arrayBuffer();
		await insert(vm, { key: url, name, size: buffer.byteLength, type: "url" }, buffer, urlFileName(url));

		const dot = url.lastIndexOf(".");
		const symUrl = `${dot > url.lastIndexOf("/") ? url.slice(0, dot) : url}.sym`;
		try {
			const symRes = await fetch(symUrl);
			if (symRes.ok) {
				await addSymbolsFromText(await symRes.text());
				console.log(`Loaded symbols from ${symUrl}`);
			}
		} catch (e) {
			console.warn(`No symbols from ${symUrl}`, e);
		}
	};

	/** Inserts a library disk (by key); it comes back at the next startup. */
	const insertFromLibrary = async (vm: VirtualMachine, key: IDBValidKey) => {
		const disk = await loadDisk(key);
		if (!disk) throw new Error(`No disk '${String(key)}' in the library`);
		if (disk.type === "url") await insertFromUrl(vm, disk.path, disk.name);
		else if (disk.type === "physical" && "data" in disk)
			await insert(
				vm,
				{ key, name: disk.name, size: disk.data.byteLength, type: disk.type },
				disk.data,
				disk.path,
			);
		remember({ type: disk.type, key });
		return inserted.value as InsertedDisk;
	};

	/** Adds a file to the library and inserts it. */
	const insertFile = async (vm: VirtualMachine, fileName: string, data: ArrayBuffer) => {
		await saveDisk(fileName, fileName, fileName, data);
		return insertFromLibrary(vm, fileName);
	};

	/** Loads a URL disk, then adds it to the library (only if it loaded). */
	const insertUrl = async (vm: VirtualMachine, url: string) => {
		await insertFromUrl(vm, url);
		await saveUrlDisk(url, urlFileName(url), url);
		await loadDisk(url); // now that it's saved, for `lastLoadedDisk`
		remember({ type: "url", key: url });
		return inserted.value as InsertedDisk;
	};

	/** Empties the drive; the next startup has no disk either. */
	const eject = async (vm: VirtualMachine) => {
		vm.ejectDisk({ slot: SLOT });
		inserted.value = null;
		remember(null);
		await setMetadataDisk(NO_DISK);
	};

	/** Renames a library disk; the drive shows the new name if it is the one inserted. */
	const rename = async (key: IDBValidKey, name: string) => {
		await renameDisk(key, name);
		if (inserted.value?.key !== key) return;
		inserted.value = { ...inserted.value, name };
		await loadDisk(key); // refreshes `lastLoadedDisk`
	};

	/** At startup: puts back the last disk inserted, unless it was ejected. */
	const restoreLastDisk = async (vm: VirtualMachine) => {
		const last = recalled();
		if (last.url) return insertFromUrl(vm, last.url, (await loadDisk(last.url))?.name);
		if (last.key) {
			const saved = await loadDisk(last.key);
			if (saved?.type === "physical") await insertFromLibrary(vm, last.key);
			return;
		}
		// Legacy: the disk was stored under key 5 (the slot); migrate it to the library.
		const legacy = await loadDisk(5);
		if (legacy?.type === "physical" && "data" in legacy) {
			await deleteDisk(5);
			await saveDisk(legacy.name, legacy.name, legacy.name, legacy.data);
			await insertFromLibrary(vm, legacy.name);
		}
	};

	return {
		inserted: shallowReadonly(inserted),
		listDisks: getAllDisks,
		insertFromLibrary,
		insertFile,
		insertUrl,
		eject,
		rename,
		restoreLastDisk,
	};
}
