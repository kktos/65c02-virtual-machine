<!--
  SegmentControl — multi-option toggle pills
-->
<template id="SegmentControl">
	<div class="flex border">
		<button
			v-for="opt in options"
			:key="opt"
			class="px-2 py-0.5 text-[9px] uppercase tracking-wider border-r last:border-r-0 transition-colors duration-100"
			:class="
				model === opt
					? 'bg-[#4afa8a] text-[#0e0e0e] font-bold'
					: 'bg-transparent  hover:text-[#4afa8a] hover:bg-[#141414]'
			"
			@click="model = opt"
		>
			{{ opt }}
		</button>
	</div>
</template>

<script lang="ts" setup>
defineProps({
	options: Array<string | number>,
});
const model = defineModel<string | number>();
</script>
