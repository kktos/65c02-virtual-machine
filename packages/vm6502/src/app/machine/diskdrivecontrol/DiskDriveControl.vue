<template>
	<div class="flex items-center">
		<Popover v-model:open="isLibraryOpen">
			<PopoverTrigger as-child>
				<button
					class="toolbar-btn group px-2 min-w-0"
					:title="`Disk Library (${fileName ? `${fileName}, ${formatSize(fileSize)}` : 'no disk inserted'})`"
				>
					<span class="relative shrink-0">
						<HardDrive
							class="h-4 w-4"
							:class="
								inserted
									? 'text-gray-300 group-hover:text-cyan-300'
									: 'text-gray-500 group-hover:text-gray-300'
							"
						/>
						<span
							v-if="inserted"
							class="absolute -bottom-1 -right-1 w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_4px_rgba(34,197,94,0.7)]"
						></span>
						<span
							v-if="loggingEnabled"
							class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_4px_rgba(239,68,68,0.6)]"
						></span>
					</span>
					<span class="hidden @[48rem]:flex flex-col items-start min-w-0 max-w-[8rem] leading-tight">
						<span
							class="text-[10px] uppercase text-gray-400 font-bold tracking-wider truncate max-w-full"
							>{{ diskConfig?.name || "Disk" }}</span
						>
						<span
							class="text-xs font-mono font-normal truncate max-w-full"
							:class="inserted ? 'text-gray-300' : 'text-gray-500 italic'"
						>
							{{ fileName || "Empty" }}
						</span>
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				class="bg-gray-900 border-gray-700 text-gray-100 relative w-[min(400px,calc(100vw-2rem))] p-0 overflow-hidden"
				align="center"
				@open-auto-focus="onOpenAutoFocus"
				@escape-key-down="onEscapeKeyDown"
				@dragover.prevent="isDragging = true"
				@dragleave="onDragLeave"
				@drop.prevent="handleDrop"
			>
				<!-- Drive: what is in it, and how it behaves -->
				<section class="p-3 border-b border-gray-800">
					<h4 class="section-title">Drive{{ diskConfig?.name ? ` · ${diskConfig.name}` : "" }}</h4>
					<div class="flex items-center gap-2.5 mt-2">
						<Link v-if="inserted?.type === 'url'" class="h-5 w-5 shrink-0 text-cyan-400" />
						<Save v-else class="h-5 w-5 shrink-0" :class="inserted ? 'text-cyan-400' : 'text-gray-600'" />
						<div class="flex-1 min-w-0 leading-tight">
							<div
								class="truncate text-sm"
								:class="inserted ? 'text-gray-100 font-medium' : 'text-gray-500 italic'"
								:title="fileName || undefined"
							>
								{{ fileName || "Empty drive" }}
							</div>
							<div v-if="inserted" class="text-[10px] text-gray-500">{{ formatSize(fileSize) }}</div>
						</div>
						<button
							v-if="inserted"
							@click="handleLookInside(inserted.key)"
							class="icon-btn shrink-0"
							title="Look inside (Disk Editor)"
						>
							<ScanSearch class="h-4 w-4" />
						</button>
						<button
							v-if="inserted"
							@click="handleEject"
							class="shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-gray-300 hover:text-cyan-300 hover:bg-gray-800 rounded border border-gray-700 transition-colors"
							title="Eject the disk (the machine then starts with an empty drive)"
						>
							<ArrowUpFromLine class="h-3.5 w-3.5" />
							Eject
						</button>
					</div>
					<div class="flex items-center justify-between mt-2.5">
						<label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
							<input
								type="checkbox"
								v-model="loggingEnabled"
								class="rounded bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-gray-900"
							/>
							Log activity
						</label>
						<button
							@click="openLogs"
							class="flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-400 hover:text-cyan-300 hover:bg-gray-800 rounded transition-colors"
						>
							<FileText class="h-3.5 w-3.5" />
							View logs
						</button>
					</div>
				</section>

				<!-- Library: search, then click (or Enter) a disk to insert it -->
				<section class="pt-3">
					<h4 class="section-title px-3">Library · {{ savedDisks.length }}</h4>
					<div v-if="savedDisks.length" class="relative px-3 mt-1.5">
						<Search
							class="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none"
						/>
						<input
							ref="searchInputRef"
							v-model="query"
							type="text"
							placeholder="Search disks…"
							aria-label="Search the library"
							class="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded pl-7 pr-7 py-1 focus:outline-none focus:border-cyan-500 placeholder-gray-500"
							@keydown="onSearchKeydown"
						/>
						<button
							v-if="query"
							class="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-500 hover:text-gray-300"
							title="Clear the search"
							@click="clearQuery"
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</div>
					<div ref="listRef" class="disk-list mt-1 px-1.5 pb-1.5 overflow-y-auto max-h-[min(55vh,26rem)]">
						<div v-if="savedDisks.length === 0" class="text-center text-xs text-gray-500 py-10">
							No disks yet. Add one from a URL or a file below.
						</div>
						<div v-else-if="rows.length === 0" class="text-center text-xs text-gray-500 py-6">
							No disk matches “{{ query.trim() }}”
						</div>

						<template v-for="group in groups" :key="group.id">
							<div v-if="group.title" class="group-title">{{ group.title }}</div>
							<div
								v-for="{ disk, index } in group.rows"
								:key="`${group.id}:${String(disk.key)}`"
								:data-index="index"
								role="button"
								tabindex="0"
								class="group relative flex items-center gap-2.5 pl-2.5 pr-1.5 py-1 rounded border-l-2 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
								:class="[
									isInDrive(disk)
										? 'border-cyan-500 cursor-default'
										: 'border-transparent cursor-pointer',
									index === activeIndex ? 'bg-gray-800' : isInDrive(disk) ? 'bg-cyan-950/30' : '',
								]"
								:title="isInDrive(disk) ? 'In the drive' : `Insert ${disk.name}`"
								@click="handleInsert(disk)"
								@keydown.enter.self="handleInsert(disk)"
								@mousemove="activeIndex = index"
								@mouseleave="pendingDeleteKey = null"
							>
								<Loader2
									v-if="loadingKey === disk.key"
									class="h-4 w-4 shrink-0 text-cyan-400 animate-spin"
								/>
								<Link v-else-if="disk.type === 'url'" class="h-4 w-4 shrink-0 text-cyan-400" />
								<Save v-else class="h-4 w-4 shrink-0 text-cyan-400" />

								<div class="flex-1 min-w-0 leading-tight">
									<input
										v-if="editingId === disk.key"
										ref="renameInputRef"
										v-model="editingName"
										class="w-full bg-gray-950 text-sm text-gray-200 border border-gray-600 rounded px-1 py-0 focus:border-cyan-500 focus:outline-none"
										@keydown.enter.stop="finishRename"
										@keydown.esc.stop="cancelRename"
										@click.stop
										@blur="finishRename"
									/>
									<div v-else class="truncate text-sm text-gray-200" :title="disk.name">
										{{ disk.name }}
									</div>
									<div class="truncate text-[10px] text-gray-500" :title="disk.path">
										<span v-if="isInDrive(disk)" class="font-bold tracking-wider text-cyan-400"
											>IN DRIVE ·
										</span>
										{{ diskDetails(disk) }}
									</div>
								</div>

								<div
									v-if="editingId !== disk.key"
									class="shrink-0 items-center gap-0.5"
									:class="
										pendingDeleteKey === disk.key
											? 'flex'
											: 'hidden group-hover:flex group-focus-within:flex'
									"
								>
									<template v-if="pendingDeleteKey === disk.key">
										<button
											@click.stop="handleDelete(disk.key)"
											class="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded transition-colors"
										>
											Delete?
										</button>
										<button @click.stop="pendingDeleteKey = null" class="icon-btn" title="Cancel">
											<X class="h-4 w-4" />
										</button>
									</template>
									<template v-else>
										<button
											@click.stop="togglePin(disk)"
											class="icon-btn"
											:class="disk.pinned ? '!text-amber-400' : ''"
											:title="disk.pinned ? 'Unpin' : 'Pin to the top of the library'"
										>
											<Star class="h-4 w-4" :class="disk.pinned ? 'fill-current' : ''" />
										</button>
										<button
											@click.stop="handleLookInside(disk.key)"
											class="icon-btn"
											title="Look inside (Disk Editor)"
										>
											<ScanSearch class="h-4 w-4" />
										</button>
										<button @click.stop="startRename(disk)" class="icon-btn" title="Rename">
											<Pencil class="h-4 w-4" />
										</button>
										<button
											@click.stop="pendingDeleteKey = disk.key"
											class="icon-btn hover:!text-red-400"
											title="Delete from the library"
										>
											<Trash2 class="h-4 w-4" />
										</button>
									</template>
								</div>
							</div>
						</template>
					</div>
				</section>

				<!-- Add: from a URL or a local file (or drop one on the popover) -->
				<section class="p-3 border-t border-gray-800 bg-gray-950/40">
					<div class="flex gap-1.5">
						<input
							v-model="urlInput"
							@input="error = null"
							type="text"
							placeholder="https://example.com/disk.dsk"
							class="flex-1 min-w-0 bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500 placeholder-gray-500"
							@keydown.enter="handleUrlLoad"
						/>
						<button
							@click="handleUrlLoad"
							:disabled="!isValidUrl || isFetchingUrl"
							class="add-btn"
							title="Insert from URL"
						>
							<Loader2 v-if="isFetchingUrl" class="h-4 w-4 animate-spin" />
							<Download v-else class="h-4 w-4" />
						</button>
						<label class="add-btn cursor-pointer" :title="`Insert a local file (${extensions.join(', ')})`">
							<FolderOpen class="h-4 w-4" />
							<input
								type="file"
								:accept="extensions.join(',')"
								@change="handleFileSelect"
								class="hidden"
							/>
						</label>
					</div>
					<div v-if="error" class="flex items-start gap-1 mt-2 text-[11px] text-red-400">
						<CircleAlert class="h-3.5 w-3.5 shrink-0 mt-px" />
						<span class="break-words min-w-0">{{ error }}</span>
					</div>
				</section>

				<div
					v-if="isDragging"
					class="absolute inset-0 flex items-center justify-center bg-gray-900/90 border-2 border-dashed border-cyan-500 rounded-md text-sm text-cyan-300 pointer-events-none"
				>
					Drop a disk image to insert it
				</div>
			</PopoverContent>
		</Popover>

		<DiskDriveLogs v-model:open="isLogSheetOpen" :logging-enabled="loggingEnabled" :file-size="fileSize" />
	</div>
</template>

<script lang="ts" setup>
import {
	ArrowUpFromLine,
	CircleAlert,
	Download,
	FileText,
	FolderOpen,
	HardDrive,
	Link,
	Loader2,
	Pencil,
	Save,
	ScanSearch,
	Search,
	Star,
	Trash2,
	X,
} from "lucide-vue-next";
import { computed, inject, nextTick, type Ref, ref, watch } from "vue";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type StoredDisk, useDiskStorage } from "@/composables/useDiskStorage";
import { diskExtensions, useDiskDrive } from "@/composables/useDiskDrive";
import { useDiskEditor } from "@/composables/useDiskEditor";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import DiskDriveLogs from "./DiskDriveLogs.vue";

const vm = inject<Ref<VirtualMachine>>("vm");

const { deleteDisk, setDiskPinned } = useDiskStorage();
const { inserted, listDisks, insertFromLibrary, insertFile, insertUrl, eject, rename } = useDiskDrive();

const diskConfig = computed(() => vm?.value?.machineConfig?.disk);
/** The image files this machine's drive takes */
const extensions = computed(() => (vm?.value ? diskExtensions(vm.value) : []));
const fileName = computed(() => inserted.value?.name ?? "");
const fileSize = computed(() => inserted.value?.size ?? 0);
const savedDisks: Ref<StoredDisk[]> = ref([]);
const isLibraryOpen = ref(false);
const isLogSheetOpen = ref(false);
const loggingEnabled = ref(false);

const urlInput = ref("");
const isFetchingUrl = ref(false);
const loadingKey: Ref<IDBValidKey | null> = ref(null);
const pendingDeleteKey: Ref<IDBValidKey | null> = ref(null);
const error = ref<string | null>(null);
const isDragging = ref(false);

const editingId: Ref<IDBValidKey | null> = ref(null);
const editingName = ref("");
const renameInputRef = ref<HTMLInputElement[] | HTMLInputElement | null>(null);

const query = ref("");
/** The row Enter inserts, ↑/↓ move: an index in `rows`; -1 = none */
const activeIndex = ref(-1);
const searchInputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

watch(isLibraryOpen, (open) => {
	// Up to date: recent disks, and disks added elsewhere (Disk Editor, MCP)
	if (open) return void refreshLibrary();
	error.value = null;
	pendingDeleteKey.value = null;
	isDragging.value = false;
	query.value = "";
	activeIndex.value = -1;
});

/** The recent disks get their own group only in a library too long to see at a glance. */
const RECENT_FROM = 8;
const RECENT_COUNT = 5;

const byName = (a: StoredDisk, b: StoredDisk) =>
	a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

type Group = { id: string; title: string | null; disks: StoredDisk[] };

/** Searching: the disks whose name or path has every word. Else: pinned, recent, then the others, by name. */
const diskGroups = computed<Group[]>(() => {
	const sorted = [...savedDisks.value].sort(byName);
	const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length) {
		const found = sorted.filter((d) => {
			const text = `${d.name} ${d.path}`.toLowerCase();
			return words.every((w) => text.includes(w));
		});
		return [{ id: "found", title: null, disks: found }];
	}
	const pinned = sorted.filter((d) => d.pinned);
	const recent =
		sorted.length > RECENT_FROM
			? sorted
					.filter((d) => !d.pinned && d.lastUsed)
					.sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
					.slice(0, RECENT_COUNT)
			: [];
	const shown = new Set([...pinned, ...recent]);
	const others = sorted.filter((d) => !shown.has(d));
	return [
		{ id: "pinned", title: "Pinned", disks: pinned },
		{ id: "recent", title: "Recent", disks: recent },
		{ id: "others", title: shown.size ? "Others" : null, disks: others },
	].filter((g) => g.disks.length);
});

/** The groups' rows, each with its index in `rows` */
const groups = computed(() => {
	let index = 0;
	return diskGroups.value.map((g) => ({ ...g, rows: g.disks.map((disk) => ({ disk, index: index++ })) }));
});
const rows = computed(() => diskGroups.value.flatMap((g) => g.disks));

// Searching: the first match is the one Enter inserts
watch(query, (q) => {
	pendingDeleteKey.value = null;
	activeIndex.value = q.trim() && rows.value.length ? 0 : -1;
	if (listRef.value) listRef.value.scrollTop = 0;
});

const showActive = () =>
	nextTick(() =>
		listRef.value?.querySelector(`[data-index="${activeIndex.value}"]`)?.scrollIntoView({ block: "nearest" }),
	);

const onSearchKeydown = (event: KeyboardEvent) => {
	const last = rows.value.length - 1;
	if (event.key === "ArrowDown") {
		event.preventDefault();
		activeIndex.value = Math.min(activeIndex.value + 1, last);
		showActive();
	} else if (event.key === "ArrowUp") {
		event.preventDefault();
		activeIndex.value = Math.max(activeIndex.value - 1, 0);
		showActive();
	} else if (event.key === "Enter") {
		const disk = rows.value[activeIndex.value];
		if (disk) {
			event.preventDefault();
			handleInsert(disk);
		}
	}
};

const clearQuery = () => {
	query.value = "";
	searchInputRef.value?.focus();
};

/** Opening the library: ready to type a disk's name */
const onOpenAutoFocus = (event: Event) => {
	if (!searchInputRef.value) return;
	event.preventDefault();
	searchInputRef.value.focus();
};

/** Esc undoes what is going on (a rename, a delete, a search) before it closes the library. */
const onEscapeKeyDown = (event: KeyboardEvent) => {
	if (editingId.value !== null) cancelRename();
	else if (pendingDeleteKey.value !== null) pendingDeleteKey.value = null;
	else if (query.value) query.value = "";
	else return;
	event.preventDefault();
};

const isInDrive = (disk: StoredDisk) => inserted.value?.key === disk.key;

const formatSize = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** "DSK · 140.0 KB · archive.org": the format, the size (unknown for a URL disk), where it comes from */
const diskDetails = (disk: StoredDisk) => {
	const file = disk.path.split(/[?#]/)[0] ?? "";
	const dot = file.lastIndexOf(".");
	const format = dot > file.lastIndexOf("/") ? file.slice(dot + 1).toUpperCase() : "";
	let source = "";
	if (disk.type === "url") {
		try {
			source = new URL(disk.path).host;
		} catch {
			source = disk.path;
		}
	} else if (disk.path !== disk.name) source = disk.path;
	return [format, disk.size ? formatSize(disk.size) : "", source].filter(Boolean).join(" · ");
};

const togglePin = async (disk: StoredDisk) => {
	await setDiskPinned(disk.key, !disk.pinned);
	await refreshLibrary();
};

const startRename = (disk: StoredDisk) => {
	pendingDeleteKey.value = null;
	editingId.value = disk.key;
	editingName.value = disk.name;
	nextTick(() => {
		const el = Array.isArray(renameInputRef.value) ? renameInputRef.value[0] : renameInputRef.value;
		el?.focus();
		el?.select();
	});
};

const cancelRename = () => {
	editingId.value = null;
	editingName.value = "";
};

const finishRename = async () => {
	if (editingId.value === null) return;
	const key = editingId.value;
	const name = editingName.value.trim();
	editingId.value = null;
	if (name) {
		await rename(key, name);
		await refreshLibrary();
	}
};

const isValidUrl = computed(() => {
	if (!urlInput.value) return false;
	try {
		const url = new URL(urlInput.value);
		const pathname = url.pathname;
		return pathname !== "/" && !pathname.endsWith("/");
	} catch {
		return false;
	}
});

const refreshLibrary = async () => {
	if (vm?.value) savedDisks.value = await listDisks(vm.value);
};

const errorMessage = (e: unknown, fallback: string) => {
	console.error(e);
	return (e as Error)?.message || fallback;
};

const insertLocalFile = async (file: File) => {
	if (!vm?.value) return;
	if (!extensions.value.some((ext) => file.name.toLowerCase().endsWith(ext))) {
		error.value = `Unsupported disk image: ${file.name} (expected ${extensions.value.join(", ")})`;
		return;
	}
	error.value = null;
	try {
		await insertFile(vm.value, file.name, await file.arrayBuffer());
		await refreshLibrary();
	} catch (e) {
		error.value = errorMessage(e, `Failed to insert ${file.name}`);
	}
};

const handleFileSelect = async (event: Event) => {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (file) await insertLocalFile(file);
	input.value = "";
};

const onDragLeave = (event: DragEvent) => {
	const target = event.currentTarget as HTMLElement | null;
	if (!target?.contains(event.relatedTarget as Node | null)) isDragging.value = false;
};

const handleDrop = async (event: DragEvent) => {
	isDragging.value = false;
	const file = event.dataTransfer?.files?.[0];
	if (file) await insertLocalFile(file);
};

const handleUrlLoad = async () => {
	if (!isValidUrl.value || !vm?.value) return;
	isFetchingUrl.value = true;
	error.value = null;
	try {
		await insertUrl(vm.value, urlInput.value);
		await refreshLibrary();
		urlInput.value = "";
		isLibraryOpen.value = false;
	} catch (e) {
		error.value = errorMessage(e, "Failed to load from URL");
	} finally {
		isFetchingUrl.value = false;
	}
};

const handleInsert = async (disk: StoredDisk) => {
	if (!vm?.value || isInDrive(disk) || editingId.value !== null || loadingKey.value !== null) return;
	loadingKey.value = disk.key;
	error.value = null;
	try {
		await insertFromLibrary(vm.value, disk.key);
		isLibraryOpen.value = false;
	} catch (e) {
		error.value = errorMessage(e, `Failed to insert ${disk.name}`);
	} finally {
		loadingKey.value = null;
	}
};

const handleEject = async () => {
	if (vm?.value) await eject(vm.value);
};

const handleDelete = async (key: IDBValidKey) => {
	pendingDeleteKey.value = null;
	await deleteDisk(key);
	await refreshLibrary();
};

const { openDisk } = useDiskEditor();
/** The disk editor: the disk's catalog / sectors, without booting it */
const handleLookInside = (key: IDBValidKey) => {
	isLibraryOpen.value = false;
	openDisk(key);
};

const openLogs = () => {
	isLibraryOpen.value = false;
	isLogSheetOpen.value = true;
};

// The machine's library (loadMachine puts its last disk back in the drive)
watch(
	() => vm?.value,
	async (newVm) => {
		if (!newVm) return;
		await newVm.ready;
		await refreshLibrary();
	},
	{ immediate: true },
);
</script>

<style scoped>
@reference "@/style.css";

.section-title {
	@apply text-[10px] uppercase font-bold tracking-wider text-gray-500;
}

.group-title {
	@apply px-2.5 pt-2 pb-0.5 text-[9px] uppercase font-bold tracking-wider text-gray-600;
}

.disk-list {
	scrollbar-width: thin;
	scrollbar-color: var(--color-gray-700) transparent;
}

.icon-btn {
	@apply p-1 rounded text-gray-500 hover:text-cyan-300 hover:bg-gray-700 transition-colors;
}

.add-btn {
	@apply shrink-0 flex items-center justify-center px-2 py-1 bg-gray-800 text-cyan-400 rounded border border-gray-700 hover:bg-gray-700 hover:text-cyan-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed;
}
</style>
