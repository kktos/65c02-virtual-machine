<template>
	<div v-if="file" class="flex flex-col h-full min-h-0 text-xs text-gray-300">
		<div class="px-3 py-2 border-b border-gray-800 space-y-1.5">
			<div class="flex items-baseline gap-2">
				<span class="font-mono text-sm text-gray-100 whitespace-pre">{{ file.name }}</span>
				<span class="text-gray-400">{{ file.typeLabel }}</span>
				<span v-if="file.locked" class="text-amber-400">locked</span>
				<span v-if="file.deleted" class="text-red-400">deleted</span>
			</div>
			<div class="flex flex-wrap gap-x-4 gap-y-0.5 text-gray-400">
				<span v-for="[label, value] in file.fields" :key="label" class="whitespace-nowrap">
					{{ label }} <span class="text-gray-200 font-mono">{{ value }}</span>
				</span>
			</div>
			<p v-if="file.error" class="text-red-400">{{ file.error }}</p>

			<!-- Its sectors / blocks: click one to see it in the disk -->
			<div v-for="group in file.groups" :key="group.label" class="flex flex-wrap items-baseline gap-1">
				<span class="text-gray-500 mr-1">{{ group.label }}</span>
				<button
					v-for="(item, i) in group.items.slice(0, MAX_CHIPS)"
					:key="i"
					class="chip"
					:class="[`chip-${group.kind}`, item.view ? '' : 'opacity-40 cursor-default']"
					:disabled="!item.view"
					@click="item.view && (view = item.view)"
				>
					{{ item.label }}
				</button>
				<span v-if="group.items.length > MAX_CHIPS" class="text-gray-500">
					+{{ group.items.length - MAX_CHIPS }} more
				</span>
			</div>
		</div>

		<div class="flex items-center gap-3 px-3 py-1 border-b border-gray-800 text-gray-400">
			<DiskViewerSwitch />
			<span>{{ shown.bytes.length.toLocaleString() }} bytes</span>
			<label v-if="file.loaded" class="flex items-center gap-1.5 cursor-pointer select-none">
				<input
					type="checkbox"
					v-model="asLoaded"
					class="rounded bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-500"
				/>
				As loaded at ${{ toHex(file.loaded.address, 4) }}
			</label>
		</div>
		<div class="flex-1 min-h-0 overflow-auto py-1">
			<component :is="current.component" :bytes="shown.bytes" :base="shown.base" />
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import type { OpenedDisk } from "@/lib/disk/diskFormat.type";
import { toHex } from "@/lib/hex.utils";
import DiskViewerSwitch from "./DiskViewerSwitch.vue";
import { useCurrentViewer } from "./viewers";

const MAX_CHIPS = 512;

const props = defineProps<{ disk: OpenedDisk }>();
const { view } = useDiskEditor();
const current = useCurrentViewer();
const asLoaded = ref(true);

const file = computed(() => {
	const v = view.value;
	return v.kind === "file" ? props.disk.readFile(v.id) : null;
});

const shown = computed(() => {
	const f = file.value;
	if (f?.loaded && asLoaded.value) return { bytes: f.loaded.bytes, base: f.loaded.address };
	return { bytes: f?.data ?? new Uint8Array(), base: 0 };
});
</script>

<style scoped>
@reference "@/style.css";

.chip {
	@apply px-1 rounded font-mono text-[10px] leading-4 transition-colors;
}
.chip-index {
	@apply bg-amber-900/40 text-amber-300 hover:bg-amber-800/60;
}
.chip-data {
	@apply bg-cyan-900/40 text-cyan-300 hover:bg-cyan-800/60;
}
</style>
