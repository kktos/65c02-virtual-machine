<template>
	<h2 class="text-xs font-semibold text-cyan-400 mb-2 uppercase tracking-wider">
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
