<template>
	<div v-if="dir" class="h-full overflow-auto text-xs">
		<div class="header">
			<span class="normal-case text-gray-200">{{ dir.title }}</span>
			<span class="text-gray-500">
				{{ dir.where.label }}
				<button
					v-for="(link, i) in dir.where.links"
					:key="i"
					class="link font-mono mr-1"
					:disabled="!link.view"
					@click="link.view && (view = link.view)"
				>
					{{ link.label }}
				</button>
			</span>
		</div>
		<p v-if="dir.error" class="error">{{ dir.error }}</p>
		<table class="w-full">
			<thead>
				<tr>
					<th v-for="(col, i) in dir.columns" :key="i" :class="headClass(col.cls)">{{ col.label }}</th>
				</tr>
			</thead>
			<tbody>
				<tr
					v-for="entry in dir.entries"
					:key="entry.id"
					class="row"
					:class="{ 'opacity-50 line-through': entry.deleted }"
					:title="entry.title"
					@click="openEntry(entry)"
				>
					<td v-for="(cell, i) in entry.cells" :key="i" :class="dir.columns[i]?.cls">{{ cell }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import type { DiskEntry, OpenedDisk } from "@/lib/disk/diskFormat.type";

const props = defineProps<{ disk: OpenedDisk }>();
const { view, expanded } = useDiskEditor();

const dir = computed(() => {
	const v = view.value;
	return v.kind === "dir" ? props.disk.readDir(v.id) : null;
});

/** A header takes its column's width and alignment, not its cells' colours */
const headClass = (cls = "") =>
	cls
		.split(" ")
		.filter((c) => c.startsWith("w-") || c === "text-right")
		.join(" ");

const openEntry = (entry: DiskEntry) => {
	const v = view.value;
	if (v.kind !== "dir") return;
	if (entry.isDir) {
		expanded.add(v.id);
		expanded.add(entry.id);
		view.value = { kind: "dir", id: entry.id };
	} else view.value = { kind: "file", id: entry.id };
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
