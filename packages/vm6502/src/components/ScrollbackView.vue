<template>
	<div class="h-full flex flex-col bg-gray-800 text-sm">
		<div
			class="flex justify-between items-center px-2 py-1 bg-gray-800/50 border-b border-gray-700 shrink-0 font-mono text-xs"
		>
			<span class="font-bold text-gray-300 uppercase tracking-wider text-[10px]">Log</span>
			<div class="flex items-center gap-3">
				<button @click="clear" class="text-[10px] hover:text-red-400 text-gray-400 transition-colors">
					Clear
				</button>
			</div>
		</div>
		<div class="flex-1 overflow-y-auto p-2 flex flex-col font-mono text-xs" ref="containerRef">
			<div class="mt-auto space-y-0.5">
				<div v-for="(line, i) in logs" :key="i" :class="line.color" class="whitespace-pre">
					{{ line.text }}
				</div>
				<div ref="logEndRef"></div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useScrollback } from "@/composables/useScrollback";

const { logs, clear } = useScrollback();
const logEndRef = ref<HTMLElement | null>(null);

watch(
	() => logs.value.length,
	async () => {
		await nextTick();
		logEndRef.value?.scrollIntoView();
	},
);
</script>
