// The disk editor's state: the library disk looked at (not the one in the drive: nothing is booted),
// what it is (sector order, file system), and what the window shows.

import { computed, reactive, ref, shallowRef } from "vue";
import { useDiskStorage } from "@/composables/useDiskStorage";
import { useFloatingWindows } from "@/composables/useFloatingWindows";
import { analyzeDisk } from "@/lib/disk/analyzeDisk";
import { SECTORS_PER_TRACK, type SectorOrder } from "@/lib/disk/diskImage";
import { sectorOwners } from "@/lib/disk/dos33";
import { blockOwners, type ProdosEntry, VOLUME_DIR_BLOCK } from "@/lib/disk/prodos";

export const DISK_EDITOR_ID = "disk_editor";

export type DiskEditorView =
	| { kind: "sector"; track: number; sector: number }
	| { kind: "block"; block: number }
	/** DOS 3.3 VTOC / ProDOS volume header and bitmap */
	| { kind: "volume" }
	| { kind: "catalog" }
	| { kind: "dosFile"; index: number }
	| { kind: "dir"; keyBlock: number; path: string }
	| { kind: "prodosFile"; path: string; entry: ProdosEntry };

const source = shallowRef<{ key: IDBValidKey; name: string; path: string } | null>(null);
const fileData = shallowRef<Uint8Array | null>(null);
const orderOverride = ref<SectorOrder | null>(null);
const view = ref<DiskEditorView>({ kind: "sector", track: 0, sector: 0 });
const loading = ref(false);
const error = ref<string | null>(null);
/** ProDOS tree: the directories shown open, by path */
const expanded = reactive(new Set<string>());

const analysis = computed(() => {
	if (!fileData.value || !source.value) return null;
	return analyzeDisk(fileData.value, source.value.path || source.value.name, orderOverride.value ?? undefined);
});

/** What each sector (DOS 3.3, by track * 16 + sector) or block (ProDOS) holds */
const owners = computed(() => {
	const disk = analysis.value;
	if (disk?.dos33) return sectorOwners(disk.image, disk.dos33);
	if (disk?.prodos) return blockOwners(disk.image, disk.prodos);
	return new Map<number, string>();
});

const ownerOfSector = (track: number, sector: number) => {
	const disk = analysis.value;
	if (!disk) return undefined;
	if (disk.format === "prodos") return owners.value.get(disk.image.sectorBlock(track, sector).block);
	return owners.value.get(track * SECTORS_PER_TRACK + sector);
};

const ownerOfBlock = (block: number) => {
	const disk = analysis.value;
	if (!disk) return undefined;
	if (disk.format !== "dos33") return owners.value.get(block);
	const names = disk.image.blockSectors(block).map(({ track, sector }) => ownerOfSector(track, sector) ?? "free");
	return names[0] === names[1] ? names[0] : names.join(" / ");
};

/** Where a disk opens: its catalog / volume directory, else track 0 sector 0 (or block 0) */
const homeView = (): DiskEditorView => {
	const disk = analysis.value;
	if (disk?.format === "dos33") return { kind: "catalog" };
	if (disk?.format === "prodos") return { kind: "dir", keyBlock: VOLUME_DIR_BLOCK, path: `/${disk.prodos?.name}` };
	if (disk?.image.hasTracks) return { kind: "sector", track: 0, sector: 0 };
	return { kind: "block", block: 0 };
};

const setOrder = (order: SectorOrder | null) => {
	orderOverride.value = order;
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

/** Loads a library disk into the editor (and opens its window unless `show` is false). */
const openDisk = async (key: IDBValidKey, show = true) => {
	if (show) useFloatingWindows().open(DISK_EDITOR_ID);
	if (source.value?.key === key && fileData.value) return;
	loading.value = true;
	error.value = null;
	try {
		const { disk, data } = await fetchData(key);
		source.value = { key, name: disk.name, path: disk.path };
		fileData.value = data;
		orderOverride.value = null;
		expanded.clear();
		view.value = homeView();
	} catch (e) {
		console.error(e);
		error.value = (e as Error)?.message || "Failed to load the disk";
	} finally {
		loading.value = false;
	}
};

export function useDiskEditor() {
	return {
		source,
		analysis,
		view,
		loading,
		error,
		expanded,
		orderOverride,
		openDisk,
		setOrder,
		homeView,
		ownerOfSector,
		ownerOfBlock,
	};
}
