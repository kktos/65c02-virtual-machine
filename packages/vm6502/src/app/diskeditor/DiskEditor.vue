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
					<span class="badge" :class="BADGE_TONES[analysis.badge.tone]">{{ analysis.badge.label }}</span>
					<select
						v-if="analysis.reading"
						:value="reading ?? 'auto'"
						class="field"
						:title="analysis.reading.title"
						@change="onReadingChange(($event.target as HTMLSelectElement).value)"
					>
						<option value="auto">{{ analysis.reading.autoLabel }}</option>
						<option v-for="c in analysis.reading.choices" :key="c.value" :value="c.value">
							{{ c.label }}
						</option>
					</select>
					<span class="text-gray-500">{{ analysis.size }}</span>
					<span v-for="w in analysis.warnings" :key="w" class="text-amber-400">{{ w }}</span>
				</template>
			</div>

			<div v-if="error || formatError" class="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400">
				<CircleAlert class="h-4 w-4" /> {{ error ?? formatError }}
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
						<template v-if="analysis.root">
							<button
								v-if="analysis.volume"
								class="tree-item w-full"
								:class="{ 'tree-on': view.kind === 'volume' }"
								@click="go({ kind: 'volume' })"
							>
								<MapIcon class="h-3.5 w-3.5 shrink-0 text-gray-400" /> {{ analysis.volume.label }}
							</button>
							<button
								class="tree-item w-full"
								:class="{ 'tree-on': view.kind === 'dir' && view.id === analysis.root.id }"
								@click="go({ kind: 'dir', id: analysis.root.id })"
							>
								<FolderOpen class="h-3.5 w-3.5 shrink-0 text-amber-300" />
								<span class="truncate">{{ analysis.root.label }}</span>
							</button>
							<DiskTree :disk="analysis" :dir-id="analysis.root.id" :depth="0" />
						</template>

						<p v-else class="px-3 py-2 text-gray-500">
							No file system found (a custom DOS?): its sectors and blocks are all there is.
						</p>

						<div class="mt-2 pt-1 border-t border-gray-800">
							<button
								v-if="analysis.layout.tracks"
								class="tree-item w-full"
								:class="{ 'tree-on': view.kind === 'sector' }"
								@click="go(lastSector)"
							>
								<Grid3x3 class="h-3.5 w-3.5 shrink-0 text-gray-400" /> Tracks / sectors
							</button>
							<button
								v-if="analysis.layout.blocks"
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
					<DiskRawView v-if="view.kind === 'sector' || view.kind === 'block'" :disk="analysis" />
					<DiskVolumeView v-else-if="view.kind === 'volume'" :disk="analysis" />
					<DiskDirectoryView v-else-if="view.kind === 'dir'" :disk="analysis" />
					<DiskFileView v-else :disk="analysis" />
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	</FloatingWindow>
</template>

<script lang="ts" setup>
import { Boxes, CircleAlert, Disc3, FolderOpen, Grid3x3, Loader2, Map as MapIcon } from "lucide-vue-next";
import { computed, ref, shallowRef, watch } from "vue";
import FloatingWindow from "@/components/FloatingWindow.vue";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DISK_EDITOR_ID, type DiskEditorView, useDiskEditor } from "@/composables/useDiskEditor";
import { useDiskDrive } from "@/composables/useDiskDrive";
import type { StoredDisk } from "@/composables/useDiskStorage";
import { useMachine } from "@/composables/useMachine";
import type { OpenedDisk } from "@/lib/disk/diskFormat.type";
import DiskDirectoryView from "./DiskDirectoryView.vue";
import DiskFileView from "./DiskFileView.vue";
import DiskRawView from "./DiskRawView.vue";
import DiskTree from "./DiskTree.vue";
import DiskVolumeView from "./DiskVolumeView.vue";

const { source, analysis, formatError, view, loading, error, reading, openDisk, setReading } = useDiskEditor();
const { inserted, listDisks } = useDiskDrive();
const { vm } = useMachine();

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

const BADGE_TONES: Record<OpenedDisk["badge"]["tone"], string> = {
	green: "bg-green-900/60 text-green-300",
	blue: "bg-blue-900/60 text-blue-300",
	amber: "bg-amber-900/60 text-amber-300",
	gray: "bg-gray-700 text-gray-300",
};

const onReadingChange = (value: string) => setReading(value === "auto" ? null : value);

/** The raw views come back where they were left; a disk starts at its first sector (track 1 on a CBM disk) */
const firstSector = (): DiskEditorView => ({
	kind: "sector",
	track: analysis.value?.layout.tracks?.first ?? 0,
	sector: 0,
});
const lastSector = ref<DiskEditorView>(firstSector());
const lastBlock = ref<DiskEditorView>({ kind: "block", block: 0 });
watch(view, (v) => {
	if (v.kind === "sector") lastSector.value = v;
	else if (v.kind === "block") lastBlock.value = v;
});
watch(
	source,
	() => {
		lastSector.value = firstSector();
		lastBlock.value = { kind: "block", block: 0 };
	},
	{ immediate: true },
);

const go = (v: DiskEditorView) => {
	view.value = v;
};

/** The library's disks for the machine's drive (its extensions) */
const refreshLibrary = async () => {
	if (!vm.value) return;
	try {
		library.value = await listDisks(vm.value);
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
