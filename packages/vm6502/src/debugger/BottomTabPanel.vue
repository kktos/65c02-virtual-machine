<template>
	<div class="flex flex-col h-full bg-gray-800 rounded-xl shadow-xl">
		<div class="flex border-b border-gray-700 px-4 shrink-0 bg-gray-900 rounded-t-xl">
			<button
				@click="setActiveTab('disassembly')"
				:class="['px-4 py-3 text-sm font-medium transition duration-150', activeTab === 'disassembly' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white hover:bg-gray-700/50']"
			>
				Disassembly
			</button>
			<button
				@click="setActiveTab('memory')"
				:class="['px-4 py-3 text-sm font-medium transition duration-150', activeTab === 'memory' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white hover:bg-gray-700/50']"
			>
				Memory Viewer
			</button>
			<button
				@click="setActiveTab('breakpoints')"
				:class="['px-4 py-3 text-sm font-medium transition duration-150', activeTab === 'breakpoints' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white hover:bg-gray-700/50']"
			>
				Breakpoints
			</button>
		</div>

		<div class="flex-grow min-h-0 p-1">
			<slot :name="activeTab"></slot>
		</div>
	</div>
</template>

<script setup lang="ts">
/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

interface Props {
	activeTab: string;
}
const props = defineProps<Props>();

const setActiveTab= (tab: string) => props.activeTab = tab;

</script>
