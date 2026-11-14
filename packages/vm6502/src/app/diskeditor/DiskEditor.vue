<template>
	<FloatingWindow
		ref="windowRef"
		:id="DISK_EDITOR_ID"
		title="Disk Editor"
		:options="{
			defaultWidth: 900,
			defaultHeight: 600,
			minWidth: 560,
			minHeight: 320,
			contentScrollable: false,
		}"
		window-class="disk-editor"
		@open="onOpen"
		@wheel.stop
	>
		<template #icon>
			<Disc3 class="h-4 w-4 text-gray-300" />
		</template>

		<div class="flex flex-col h-full min-h-0 text-gray-200">
			<!-- The disk looked at, what it is -->
			<div class="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-gray-700 bg-gray-900/60 text-xs">
				<select
					v-model="selectedKey"
					class="field max-w-60"
					title="A disk of the library"
					@focus="refreshLibrary"
				>
					<option :value="null" disabled>Pick a disk…</option>
					<option v-for="disk in library" :key="String(disk.key)" :value="String(disk.key)">
						{{ disk.name }}{{ isInserted(disk.key) ? " (in the drive)" : "" }}
					</option>
				</select>
				<Loader2 v-if="loading" class="h-4 w-4 animate-spin text-cyan-400" />
				<template v-if="analysis">
					<span class="badge" :class="formatBadge.cls">{{ formatBadge.label }}</span>
					<select
						v-if="analysis.image.hasTracks"
						:value="orderOverride ?? 'auto'"
						class="field"
						title="Sector order of the image: .dsk / .do are usually DOS order, .po ProDOS order"
						@change="onOrderChange(($event.target as HTMLSelectElement).value)"
					>
						<option value="auto">{{ autoOrderLabel }}</option>
						<option value="dos">DOS order (.do)</option>
						<option value="prodos">ProDOS order (.po)</option>
					</select>
					<span class="text-gray-500">{{ sizeLabel }}</span>
					<span v-for="w in analysis.warnings" :key="w" class="text-amber-400">{{ w }}</span>
				</template>
			</div>

			<div v-if="error" class="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400">
				<CircleAlert class="h-4 w-4" /> {{ error }}
			</div>
			<div v-else-if="!analysis" class="flex-1 flex items-center justify-center text-xs text-gray-500">
				{{ loading ? "Loading…" : "Pick a disk of the library to look inside it." }}
			</div>

			<ResizablePanelGroup
				v-else
				direction="horizontal"
				auto-save-id="diskEditorPanelLayout"
				class="flex-1 min-h-0"
			>
				<!-- What is on the disk -->
				<ResizablePanel :default-size="26" :min-size="15" class="flex flex-col min-h-0">
					<nav class="flex-1 min-h-0 overflow-auto py-1 text-xs">
						<template v-if="analysis.dos33">
							<button
								class="tree-item w-full"
								:class="{ 'tree-on': view.kind === 'volume' }"
								@click="go({ kind: 'volume' })"
							>
								<MapIcon class="h-3.5 w-3.5 shrink-0 text-gray-400" /> VTOC · sector map
							</button>
							<button
								class="tree-item w-full"
								:class="{ 'tree-on': view.kind === 'catalog' }"
								@click="go({ kind: 'catalog' })"
							>
								<FolderOpen class="h-3.5 w-3.5 shrink-0 text-amber-300" /> Catalog
							</button>
							<button
								v-for="(file, index) in analysis.dos33.files"
								:key="index"
								class="tree-item w-full pl-7!"
								:class="{
									'tree-on': view.kind === 'dosFile' && view.index === index,
									'opacity-50 line-through': file.deleted,
								}"
								@click="go({ kind: 'dosFile', index })"
							>
								<span class="w-3 shrink-0 font-mono text-[10px] text-gray-500">{{ file.type }}</span>
								<span class="truncate font-mono whitespace-pre">{{ file.name }}</span>
								<Lock v-if="file.locked" class="ml-auto h-3 w-3 shrink-0 text-amber-400" />
							</button>
						</template>

						<template v-else-if="analysis.prodos">
							<button
								class="tree-item w-full"
								:class="{ 'tree-on': view.kind === 'volume' }"
								@click="go({ kind: 'volume' })"
							>
								<MapIcon class="h-3.5 w-3.5 shrink-0 text-gray-400" /> Volume · block map
							</button>
							<button
								class="tree-item w-full"
								:class="{ 'tree-on': view.kind === 'dir' && view.path === rootPath }"
								@click="go({ kind: 'dir', keyBlock: analysis.prodos.keyBlock, path: rootPath })"
							>
								<FolderOpen class="h-3.5 w-3.5 shrink-0 text-amber-300" />
								<span class="truncate">{{ rootPath }}</span>
							</button>
							<DiskProdosTree
								:image="analysis.image"
								:key-block="analysis.prodos.keyBlock"
								:path="rootPath"
								:depth="0"
							/>
						</template>

						<p v-else class="px-3 py-2 text-gray-500">
							No DOS 3.3 catalog, no ProDOS volume: a custom DOS? Its tracks and sectors are all there is.
						</p>

						<div class="mt-2 pt-1 border-t border-gray-800">
							<button
								v-if="analysis.image.hasTracks"
								class="tree-item w-full"
								:class="{ 'tree-on': view.kind === 'sector' }"
								@click="go(lastSector)"
							>
								<Grid3x3 class="h-3.5 w-3.5 shrink-0 text-gray-400" /> Tracks / sectors
							</button>
							<button
								class="tree-item w-full"
								:class="{ 'tree-on': view.kind === 'block' }"
								@click="go(lastBlock)"
							>
								<Boxes class="h-3.5 w-3.5 shrink-0 text-gray-400" /> Blocks
							</button>
						</div>
					</nav>
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel :default-size="74" class="min-h-0 min-w-0">
					<DiskRawView
						v-if="view.kind === 'sector' || view.kind === 'block'"
						:image="analysis.image"
						:has-file-system="analysis.format !== 'unknown'"
					/>
					<DiskVolumeView v-else-if="view.kind === 'volume'" />
					<DiskDirectoryView v-else-if="view.kind === 'catalog' || view.kind === 'dir'" />
					<DiskFileView v-else />
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	</FloatingWindow>
</template>

<script lang="ts" setup>
import { Boxes, CircleAlert, Disc3, FolderOpen, Grid3x3, Loader2, Lock, Map as MapIcon } from "lucide-vue-next";
import { computed, ref, shallowRef, watch } from "vue";
import FloatingWindow from "@/components/FloatingWindow.vue";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DISK_EDITOR_ID, type DiskEditorView, useDiskEditor } from "@/composables/useDiskEditor";
import { useDiskDrive } from "@/composables/useDiskDrive";
import type { StoredDisk } from "@/composables/useDiskStorage";
import type { SectorOrder } from "@/lib/disk/diskImage";
import DiskDirectoryView from "./DiskDirectoryView.vue";
import DiskFileView from "./DiskFileView.vue";
import DiskProdosTree from "./DiskProdosTree.vue";
import DiskRawView from "./DiskRawView.vue";
import DiskVolumeView from "./DiskVolumeView.vue";

const { source, analysis, view, loading, error, orderOverride, openDisk, setOrder } = useDiskEditor();
const { inserted, listAllDisks } = useDiskDrive();

const windowRef = ref<InstanceType<typeof FloatingWindow> | null>(null);
const library = shallowRef<StoredDisk[]>([]);

const isInserted = (key: IDBValidKey) => inserted.value?.key === key;

/** Library keys are strings (file names, URLs) or the legacy number 5: the select works on strings */
const selectedKey = computed({
	get: () => (source.value ? String(source.value.key) : null),
	set: (key: string | null) => {
		const disk = library.value.find((d) => String(d.key) === key);
		if (disk) openDisk(disk.key, false);
	},
});

const rootPath = computed(() => `/${analysis.value?.prodos?.name ?? ""}`);

const formatBadge = computed(() => {
	switch (analysis.value?.format) {
		case "dos33":
			return { label: "DOS 3.3", cls: "bg-green-900/60 text-green-300" };
		case "prodos":
			return { label: "ProDOS", cls: "bg-blue-900/60 text-blue-300" };
		default:
			return { label: "Unknown format", cls: "bg-gray-700 text-gray-300" };
	}
});

const orderName = (order: SectorOrder) => (order === "dos" ? "DOS order" : "ProDOS order");
const autoOrderLabel = computed(() => {
	const disk = analysis.value;
	if (!disk || orderOverride.value) return "Auto";
	return `Auto: ${orderName(disk.image.order)} (${disk.orderSource})`;
});

const sizeLabel = computed(() => {
	const image = analysis.value?.image;
	if (!image) return "";
	if (image.hasTracks) return "35 tracks x 16 sectors · 280 blocks";
	return `${image.blockCount.toLocaleString()} blocks (${(image.data.length / 1024).toLocaleString()} KB)`;
});

const onOrderChange = (value: string) => setOrder(value === "auto" ? null : (value as SectorOrder));

/** The raw views come back where they were left */
const lastSector = ref<DiskEditorView>({ kind: "sector", track: 0, sector: 0 });
const lastBlock = ref<DiskEditorView>({ kind: "block", block: 0 });
watch(view, (v) => {
	if (v.kind === "sector") lastSector.value = v;
	else if (v.kind === "block") lastBlock.value = v;
});
watch(source, () => {
	lastSector.value = { kind: "sector", track: 0, sector: 0 };
	lastBlock.value = { kind: "block", block: 0 };
});

const go = (v: DiskEditorView) => {
	view.value = v;
};

const refreshLibrary = async () => {
	try {
		library.value = await listAllDisks();
	} catch (e) {
		console.error("Disk editor: failed to list the library", e);
	}
};

/** Opened with no disk (SHOW, or open at startup): the disk in the drive */
const onOpen = async () => {
	await refreshLibrary();
	if (!source.value && !loading.value && inserted.value) await openDisk(inserted.value.key, false);
};

// Restored open at startup (the window remembers it), or the drive's disk restored after it
watch(
	() => windowRef.value?.isOpen && inserted.value,
	(ready) => {
		if (ready) onOpen();
	},
	{ immediate: true },
);
</script>

<style>
@reference "@/style.css";

.disk-editor .tree-item {
	@apply flex items-center gap-1.5 px-2 py-0.5 text-left text-gray-300 hover:bg-gray-800 rounded-sm transition-colors;
}
.disk-editor .tree-on {
	@apply bg-cyan-900/40 text-cyan-100;
}
.disk-editor .field {
	@apply bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-1.5 py-0.5 focus:outline-none focus:border-cyan-500;
}
.disk-editor .badge {
	@apply px-1.5 py-px rounded text-[10px] font-bold uppercase tracking-wider;
}
</style>
