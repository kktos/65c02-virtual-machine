<template>
	<ul>
		<li v-if="dir.error" class="tree-item text-red-400" :style="indent">{{ dir.error }}</li>
		<li v-for="entry in dir.entries" :key="`${entry.block}.${entry.index}`">
			<button
				class="tree-item w-full"
				:class="{ 'tree-on': isSelected(entry) }"
				:style="indent"
				:title="`${fileTypeName(entry.fileType)} · ${entry.eof.toLocaleString()} bytes`"
				@click="select(entry)"
			>
				<template v-if="isDirectory(entry)">
					<ChevronDown
						v-if="expanded.has(childPath(entry))"
						class="h-3 w-3 shrink-0"
						@click.stop="toggle(entry)"
					/>
					<ChevronRight v-else class="h-3 w-3 shrink-0" @click.stop="toggle(entry)" />
					<Folder class="h-3.5 w-3.5 shrink-0 text-amber-300" />
				</template>
				<template v-else>
					<span class="w-3 shrink-0"></span>
					<File class="h-3.5 w-3.5 shrink-0 text-gray-400" />
				</template>
				<span class="truncate">{{ entry.name }}</span>
				<span class="ml-auto pl-2 text-[10px] text-gray-500 font-mono">{{ fileTypeName(entry.fileType) }}</span>
			</button>
			<DiskProdosTree
				v-if="isDirectory(entry) && expanded.has(childPath(entry)) && depth < MAX_DEPTH"
				:image="image"
				:key-block="entry.keyPointer"
				:path="childPath(entry)"
				:depth="depth + 1"
			/>
		</li>
	</ul>
</template>

<script lang="ts" setup>
import { ChevronDown, ChevronRight, File, Folder } from "lucide-vue-next";
import { computed } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import type { DiskImage } from "@/lib/disk/diskImage";
import { fileTypeName, isDirectory, type ProdosEntry, readDirectory } from "@/lib/disk/prodos";

const MAX_DEPTH = 16;

const props = defineProps<{ image: DiskImage; keyBlock: number; path: string; depth: number }>();
const { view, expanded } = useDiskEditor();

const dir = computed(() => {
	try {
		return readDirectory(props.image, props.keyBlock);
	} catch (e) {
		return { entries: [] as ProdosEntry[], error: (e as Error).message };
	}
});

const childPath = (entry: ProdosEntry) => `${props.path}/${entry.name}`;
const indent = computed(() => ({ paddingLeft: `${0.5 + (props.depth + 1) * 0.75}rem` }));

const isSelected = (entry: ProdosEntry) => {
	const v = view.value;
	if (v.kind === "dir") return v.path === childPath(entry);
	return v.kind === "prodosFile" && v.path === childPath(entry);
};

const toggle = (entry: ProdosEntry) => {
	const path = childPath(entry);
	if (expanded.has(path)) expanded.delete(path);
	else expanded.add(path);
};

const select = (entry: ProdosEntry) => {
	const path = childPath(entry);
	if (isDirectory(entry)) {
		expanded.add(path);
		view.value = { kind: "dir", keyBlock: entry.keyPointer, path };
	} else view.value = { kind: "prodosFile", path, entry };
};
</script>
