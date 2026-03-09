<template>
	<div class="h-full flex flex-col">
		<div class="flex-1 overflow-y-auto overflow-x-hidden p-2 flex flex-col" ref="containerRef">
			<div class="mt-auto space-y-0.5">
				<div v-for="(line, i) in logs" :key="i" :class="line.color" class="whitespace-pre-wrap">
					{{ line.text || "\u00A0" }}
				</div>
				<div ref="logEndRef"></div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { LogLine } from "@/composables/useScrollback";

const props = defineProps<{
	logs: readonly LogLine[];
}>();

const logEndRef = ref<HTMLElement | null>(null);

watch(
	() => props.logs.length,
	async () => {
		await nextTick();
		logEndRef.value?.scrollIntoView({ behavior: "smooth" });
	},
);
</script>
