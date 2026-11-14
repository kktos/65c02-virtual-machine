<template>
	<div v-if="dir" class="h-full overflow-auto text-xs">
		<div class="header">
			<span class="flex items-baseline gap-2">
				<span class="normal-case text-gray-200">{{ dir.title }}</span>
				<button
					v-if="canCopy"
					class="copy-btn"
					:disabled="!selected.size"
					:title="selected.size ? 'Copy the files ticked to another disk' : 'Tick files to copy them'"
					@click="panel = { kind: 'copy', ids: [...selected] }"
				>
					<Copy class="h-3 w-3" /> Copy {{ selected.size || "" }} to…
				</button>
			</span>
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
					<th v-if="canCopy" class="w-6">
						<input
							type="checkbox"
							class="tick"
							title="All the files"
							:checked="copyable.length > 0 && selected.size === copyable.length"
							:indeterminate="selected.size > 0 && selected.size < copyable.length"
							:disabled="!copyable.length"
							@change="toggleAll(($event.target as HTMLInputElement).checked)"
						/>
					</th>
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
					<td v-if="canCopy" class="w-6" @click.stop>
						<input
							v-if="copyable.includes(entry.id)"
							type="checkbox"
							class="tick"
							:checked="selected.has(entry.id)"
							@change="toggle(entry.id)"
						/>
					</td>
					<td v-for="(cell, i) in entry.cells" :key="i" :class="dir.columns[i]?.cls">{{ cell }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<script lang="ts" setup>
import { Copy } from "lucide-vue-next";
import { computed, watch } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import type { DiskEntry, OpenedDisk } from "@/lib/disk/diskFormat.type";

const props = defineProps<{ disk: OpenedDisk }>();
const { view, expanded, selected, panel } = useDiskEditor();

const dir = computed(() => {
	const v = view.value;
	return v.kind === "dir" ? props.disk.readDir(v.id) : null;
});

/** Files can be copied off this disk: the ones of this directory that can (not a directory, not deleted) */
const canCopy = computed(() => !!props.disk.exportFile);
const copyable = computed(() => (dir.value?.entries ?? []).filter((e) => !e.isDir && !e.deleted).map((e) => e.id));

// The ticks are this directory's
watch(
	() => (view.value.kind === "dir" ? view.value.id : null),
	() => selected.clear(),
);

const toggle = (id: string) => {
	if (selected.has(id)) selected.delete(id);
	else selected.add(id);
};
const toggleAll = (on: boolean) => {
	selected.clear();
	if (on) for (const id of copyable.value) selected.add(id);
};

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
.copy-btn {
	@apply flex items-center gap-1 px-1.5 py-px rounded border border-gray-700 text-gray-300 hover:border-cyan-500 hover:text-cyan-200 disabled:opacity-40 disabled:hover:border-gray-700 disabled:hover:text-gray-300;
}
.tick {
	@apply rounded bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-500 cursor-pointer;
}
</style>
