// The disk editor's state: the library disk looked at (not the one in the drive: nothing is booted), what it is
// (opened by one of the machine's disk formats), and what the window shows. The machine's config says which
// formats its disks are in and which viewers make sense (`disk.formats`, `disk.viewers`): nothing here knows
// of a DOS or a machine.

import { computed, reactive, ref, shallowRef } from "vue";
import { useDiskStorage } from "@/composables/useDiskStorage";
import { useFloatingWindows } from "@/composables/useFloatingWindows";
import type { DiskEditorView, OpenedDisk } from "@/lib/disk/diskFormat.type";
import { DISK_FORMATS } from "@/lib/disk/formats";
import type { HgrMode } from "@/lib/disk/hgrImage.utils";
import type { MachineConfig } from "@/types/machine.interface";

export type { DiskEditorView };

export const DISK_EDITOR_ID = "disk_editor";

const HEX = "hex";

/** The machine whose disks are looked at */
const machine = shallowRef<Pick<MachineConfig, "name" | "disk"> | null>(null);
const source = shallowRef<{ key: IDBValidKey; name: string; path: string } | null>(null);
const fileData = shallowRef<Uint8Array | null>(null);
/** How the image is read, a choice of `OpenedDisk.reading` (an Apple floppy's sector order); null: auto */
const reading = ref<string | null>(null);
const view = ref<DiskEditorView>({ kind: "sector", track: 0, sector: 0 });
const loading = ref(false);
const error = ref<string | null>(null);
/** The viewer picked: stays while moving around a disk, back to the hex dump for another disk */
const viewer = ref<string>(HEX);
const hgrMode = ref<HgrMode>("color");
const disasmLabels = ref(true);
/** The directories shown open in the tree, by id */
const expanded = reactive(new Set<string>());

/** The machine's viewers (ids), as its config lists them */
const viewers = computed(() => machine.value?.disk?.viewers ?? []);

/** The disk opened by the first of the machine's formats that takes it; else why none does */
const opened = computed((): { disk: OpenedDisk | null; error: string | null } => {
	const data = fileData.value;
	const src = source.value;
	if (!data || !src) return { disk: null, error: null };
	const ids = machine.value?.disk?.formats ?? [];
	for (const id of ids) {
		const format = DISK_FORMATS[id];
		if (!format) {
			console.warn(`Disk editor: no disk format '${id}'`);
			continue;
		}
		const disk = format.open(data, src.path || src.name, reading.value);
		if (disk) return { disk, error: null };
	}
	const names = ids.flatMap((id) => DISK_FORMATS[id]?.name ?? []);
	return {
		disk: null,
		error: names.length
			? `${src.name}: not a disk the editor reads as ${names.join(" / ")}`
			: `The ${machine.value?.name ?? "machine"} has no disk format the editor reads`,
	};
});

const analysis = computed(() => opened.value.disk);
const formatError = computed(() => opened.value.error);

const ownerOfSector = (track: number, sector: number) => analysis.value?.ownerOfSector(track, sector);
const ownerOfBlock = (block: number) => analysis.value?.ownerOfBlock(block);

/** Where a disk opens: its catalog / root directory, else its first sector (or block) */
const homeView = (): DiskEditorView => analysis.value?.home ?? { kind: "sector", track: 0, sector: 0 };

const setReading = (value: string | null) => {
	reading.value = value;
	expanded.clear();
	view.value = homeView();
};

const fetchData = async (key: IDBValidKey) => {
	const { loadDisk } = useDiskStorage();
	const disk = await loadDisk(key);
	if (!disk) throw new Error(`No disk '${String(key)}' in the library`);
	if (disk.type === "physical") return { disk, data: new Uint8Array(disk.data) };
	const response = await fetch(disk.path);
	if (!response.ok) throw new Error(`Failed to load ${disk.path}: ${response.statusText}`);
	return { disk, data: new Uint8Array(await response.arrayBuffer()) };
};

/** Bumped by closeDisk: a load still in flight then drops what it gets */
let generation = 0;

/** Loads a library disk into the editor (and opens its window unless `show` is false). */
const openDisk = async (key: IDBValidKey, show = true) => {
	if (show) useFloatingWindows().open(DISK_EDITOR_ID);
	if (source.value?.key === key && fileData.value) return;
	const loadGeneration = generation;
	loading.value = true;
	error.value = null;
	try {
		const { disk, data } = await fetchData(key);
		if (loadGeneration !== generation) return;
		source.value = { key, name: disk.name, path: disk.path };
		fileData.value = data;
		reading.value = null;
		expanded.clear();
		view.value = homeView();
		viewer.value = HEX;
	} catch (e) {
		if (loadGeneration !== generation) return;
		console.error(e);
		error.value = (e as Error)?.message || "Failed to load the disk";
	} finally {
		if (loadGeneration === generation) loading.value = false;
	}
};

/**
 * Closes the window and forgets the disk: another machine came, whose disks, file systems and viewers aren't
 * this one's. Opened again, the editor starts from the new machine's drive.
 */
const closeDisk = () => {
	generation++;
	useFloatingWindows().close(DISK_EDITOR_ID);
	source.value = null;
	fileData.value = null;
	reading.value = null;
	expanded.clear();
	view.value = { kind: "sector", track: 0, sector: 0 };
	viewer.value = HEX;
	loading.value = false;
	error.value = null;
};

/** The machine started: its formats and viewers. Another machine than the one before closes the disk. */
const setMachine = (config: Pick<MachineConfig, "name" | "disk">) => {
	if (machine.value && machine.value.name !== config.name) closeDisk();
	machine.value = config;
};

export function useDiskEditor() {
	return {
		machine,
		source,
		analysis,
		formatError,
		view,
		loading,
		error,
		expanded,
		viewer,
		viewers,
		hgrMode,
		disasmLabels,
		reading,
		openDisk,
		closeDisk,
		setMachine,
		setReading,
		homeView,
		ownerOfSector,
		ownerOfBlock,
	};
}
