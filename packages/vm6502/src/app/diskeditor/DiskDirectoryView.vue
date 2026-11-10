<template>
	<div class="h-full overflow-auto text-xs">
		<!-- DOS 3.3 catalog -->
		<template v-if="view.kind === 'catalog' && catalog">
			<div class="header">
				<span>Catalog · {{ liveFiles }} files</span>
				<span class="text-gray-500">
					sectors
					<button
						v-for="(ts, i) in catalog.sectors"
						:key="i"
						class="link font-mono mr-1"
						@click="view = { kind: 'sector', ...ts }"
					>
						{{ tsLabel(ts) }}
					</button>
				</span>
			</div>
			<p v-if="catalog.error" class="error">{{ catalog.error }}</p>
			<table class="w-full">
				<thead>
					<tr>
						<th class="w-4"></th>
						<th class="w-6">Type</th>
						<th class="w-12 text-right">Sectors</th>
						<th>Name</th>
						<th class="w-20">T/S list</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="(file, index) in catalog.files"
						:key="index"
						class="row"
						:class="{ 'opacity-50 line-through': file.deleted }"
						:title="file.deleted ? 'Deleted' : DOS33_TYPE_NAMES[file.type]"
						@click="view = { kind: 'dosFile', index }"
					>
						<td class="text-amber-400">{{ file.locked ? "*" : "" }}</td>
						<td class="font-mono">{{ file.type }}</td>
						<td class="text-right tabular-nums">{{ file.sectorCount }}</td>
						<td class="font-mono text-gray-100 whitespace-pre">{{ file.name }}</td>
						<td class="font-mono text-gray-500">{{ tsLabel(file.tsList) }}</td>
					</tr>
				</tbody>
			</table>
		</template>

		<!-- ProDOS directory -->
		<template v-else-if="view.kind === 'dir' && dir">
			<div class="header">
				<span class="font-mono normal-case text-gray-200">{{ view.path }}</span>
				<span class="text-gray-500">
					{{ dir.entries.length }} entries · blocks
					<button
						v-for="b in dir.blocks"
						:key="b"
						class="link mr-1"
						@click="view = { kind: 'block', block: b }"
					>
						{{ b }}
					</button>
				</span>
			</div>
			<p v-if="dir.error" class="error">{{ dir.error }}</p>
			<table class="w-full">
				<thead>
					<tr>
						<th>Name</th>
						<th class="w-10">Type</th>
						<th class="w-14">Aux</th>
						<th class="w-20">Storage</th>
						<th class="w-12 text-right">Blocks</th>
						<th class="w-16 text-right">EOF</th>
						<th class="w-28">Modified</th>
						<th class="w-12 text-right">Key</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="entry in dir.entries"
						:key="`${entry.block}.${entry.index}`"
						class="row"
						@click="openEntry(entry)"
					>
						<td class="font-mono text-gray-100">
							<span v-if="(entry.access & 0xc2) !== 0xc2" class="text-amber-400" title="Locked">*</span>
							{{ entry.name }}{{ isDirectory(entry) ? "/" : "" }}
						</td>
						<td class="font-mono">{{ fileTypeName(entry.fileType) }}</td>
						<td class="font-mono text-gray-400">${{ toHex(entry.auxType, 4) }}</td>
						<td class="text-gray-400">{{ STORAGE_TYPES[entry.storageType] ?? entry.storageType }}</td>
						<td class="text-right tabular-nums">{{ entry.blocksUsed }}</td>
						<td class="text-right tabular-nums">{{ entry.eof.toLocaleString() }}</td>
						<td class="text-gray-400 tabular-nums whitespace-nowrap">{{ entry.modified ?? "-" }}</td>
						<td class="text-right tabular-nums text-gray-500">{{ entry.keyPointer }}</td>
					</tr>
				</tbody>
			</table>
		</template>
	</div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import type { TrackSector } from "@/lib/disk/diskImage";
import { DOS33_TYPE_NAMES } from "@/lib/disk/dos33";
import { fileTypeName, isDirectory, type ProdosEntry, readDirectory, STORAGE_TYPES } from "@/lib/disk/prodos";
import { toHex } from "@/lib/hex.utils";

const { analysis, view, expanded } = useDiskEditor();

const catalog = computed(() => analysis.value?.dos33);
const liveFiles = computed(() => catalog.value?.files.filter((f) => !f.deleted).length ?? 0);

const dir = computed(() => {
	const v = view.value;
	const disk = analysis.value;
	if (v.kind !== "dir" || !disk) return null;
	if (disk.prodos && v.keyBlock === disk.prodos.keyBlock) return disk.prodos;
	try {
		return readDirectory(disk.image, v.keyBlock);
	} catch (e) {
		return { entries: [], blocks: [], error: (e as Error).message };
	}
});

const tsLabel = (ts: TrackSector) => `T${toHex(ts.track)} S${toHex(ts.sector, 1)}`;

const openEntry = (entry: ProdosEntry) => {
	const v = view.value;
	if (v.kind !== "dir") return;
	const path = `${v.path}/${entry.name}`;
	if (isDirectory(entry)) {
		expanded.add(v.path);
		expanded.add(path);
		view.value = { kind: "dir", keyBlock: entry.keyPointer, path };
	} else view.value = { kind: "prodosFile", path, entry };
};
</script>

<style scoped>
@reference "@/style.css";

.header {
	@apply sticky top-0 z-10 flex flex-wrap items-baseline justify-between gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-[11px] uppercase font-bold tracking-wider text-gray-400;
}
.header button,
.header .text-gray-500 {
	@apply normal-case font-normal tracking-normal;
}
th {
	@apply sticky top-8 bg-gray-900 px-2 py-1 text-left text-[10px] uppercase font-semibold tracking-wider text-gray-500 border-b border-gray-800;
}
td {
	@apply px-2 py-0.5 text-gray-300;
}
.row {
	@apply cursor-pointer hover:bg-gray-800;
}
.link {
	@apply text-cyan-400 hover:text-cyan-300 hover:underline;
}
.error {
	@apply px-3 py-1 text-red-400;
}
</style>
