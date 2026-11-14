<template>
	<button
		@click="toggleWindow"
		class="toolbar-btn group"
		:class="{ 'bg-gray-700 ring-1 ring-cyan-500/50': memoryMapWindow?.isOpen }"
		:aria-pressed="!!memoryMapWindow?.isOpen"
		title="Memory Map"
	>
		<MapIcon class="h-4 w-4 text-cyan-400 group-hover:text-cyan-300" />
	</button>

	<FloatingWindow
		ref="memoryMapWindow"
		id="memory_region_map"
		title="Memory Map"
		:options="{
			defaultWidth: 600,
			defaultHeight: 500,
			minWidth: 400,
			minHeight: 300,
			contentScrollable: false,
		}"
	>
		<template #icon>
			<MapIcon class="h-4 w-4" />
		</template>
		<div class="p-4 h-full overflow-hidden">
			<MemoryMapContainer />
		</div>
	</FloatingWindow>
</template>

<script lang="ts" setup>
import { Map as MapIcon } from "lucide-vue-next";
import { ref } from "vue";
import MemoryMapContainer from "./MemoryMapContainer.vue";
import FloatingWindow from "@/components/FloatingWindow.vue";

const memoryMapWindow = ref<InstanceType<typeof FloatingWindow> | null>(null);

const toggleWindow = () => {
	memoryMapWindow.value?.toggle();
};
</script>
