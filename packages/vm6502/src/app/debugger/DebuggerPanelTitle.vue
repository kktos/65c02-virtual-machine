<template>
	<h2 class="text-xs font-semibold text-cyan-400 border-b border-gray-700/50 pb-2 mb-3 uppercase tracking-wider">
		{{ title }}
	</h2>
</template>
<script lang="ts" setup>
	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

	interface Props {
		title: string;
	}
	const { title } = defineProps<Props>();
</script>
