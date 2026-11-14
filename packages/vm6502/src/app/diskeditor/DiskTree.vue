<template>
	<ul>
		<li v-if="dir.error" class="tree-item text-red-400" :style="indent">{{ dir.error }}</li>
		<li v-for="entry in dir.entries" :key="entry.id">
			<button
				class="tree-item w-full"
				:class="{ 'tree-on': isSelected(entry), 'opacity-50 line-through': entry.deleted }"
				:style="indent"
				:title="entry.title"
				@click="select(entry)"
			>
				<template v-if="entry.isDir">
					<ChevronDown v-if="expanded.has(entry.id)" class="h-3 w-3 shrink-0" @click.stop="toggle(entry)" />
					<ChevronRight v-else class="h-3 w-3 shrink-0" @click.stop="toggle(entry)" />
					<Folder class="h-3.5 w-3.5 shrink-0 text-amber-300" />
				</template>
				<template v-else>
					<span class="w-3 shrink-0"></span>
					<File class="h-3.5 w-3.5 shrink-0 text-gray-400" />
				</template>
				<span class="truncate font-mono whitespace-pre">{{ entry.name }}</span>
				<Lock v-if="entry.locked" class="h-3 w-3 shrink-0 text-amber-400" />
				<span class="ml-auto pl-2 text-[10px] text-gray-500 font-mono">{{ entry.type }}</span>
			</button>
			<DiskTree
				v-if="entry.isDir && expanded.has(entry.id) && depth < MAX_DEPTH"
				:disk="disk"
				:dir-id="entry.id"
				:depth="depth + 1"
			/>
		</li>
	</ul>
</template>

<script lang="ts" setup>
import { ChevronDown, ChevronRight, File, Folder, Lock } from "lucide-vue-next";
import { computed } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import type { DiskEntry, OpenedDisk } from "@/lib/disk/diskFormat.type";

const MAX_DEPTH = 16;

/** The entries of a directory, its subdirectories open below them when expanded */
const props = defineProps<{ disk: OpenedDisk; dirId: string; depth: number }>();
const { view, expanded } = useDiskEditor();

const dir = computed(() => props.disk.readDir(props.dirId));
const indent = computed(() => ({ paddingLeft: `${0.5 + (props.depth + 1) * 0.75}rem` }));

const isSelected = (entry: DiskEntry) => {
	const v = view.value;
	return (v.kind === "dir" || v.kind === "file") && v.id === entry.id;
};

const toggle = (entry: DiskEntry) => {
	if (expanded.has(entry.id)) expanded.delete(entry.id);
	else expanded.add(entry.id);
};

const select = (entry: DiskEntry) => {
	if (entry.isDir) {
		expanded.add(entry.id);
		view.value = { kind: "dir", id: entry.id };
	} else view.value = { kind: "file", id: entry.id };
};
</script>
