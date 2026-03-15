<template>
	<button
		@click="toggleWindow"
		class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 transition-colors shrink-0"
		:class="{ 'bg-gray-600 border-cyan-500/50': memoryMapWindow?.isOpen }"
		title="Memory Map"
	>
		<MapIcon class="h-5 w-5 text-cyan-400 group-hover:text-cyan-300" />
	</button>

	<FloatingWindow
		ref="memoryMapWindow"
		id="memory-map"
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
