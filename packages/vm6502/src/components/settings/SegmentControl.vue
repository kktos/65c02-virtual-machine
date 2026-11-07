<!--
  SegmentControl — multi-option toggle pills
  Options are plain values, or { label, value } when the displayed text differs from the value.
-->
<template id="SegmentControl">
	<div class="flex border">
		<button
			v-for="opt in normalized"
			:key="opt.value"
			type="button"
			class="px-2 py-0.5 text-[9px] uppercase tracking-wider border-r last:border-r-0 transition-colors duration-100"
			:class="
				model === opt.value
					? 'bg-[#4afa8a] text-[#0e0e0e] font-bold'
					: 'bg-transparent  hover:text-[#4afa8a] hover:bg-[#141414]'
			"
			@click="model = opt.value"
		>
			{{ opt.label }}
		</button>
	</div>
</template>

<script lang="ts" setup>
import { computed } from "vue";

type Value = string | number;
const props = defineProps<{
	options: Array<Value | { label: string; value: Value }>;
}>();
const model = defineModel<Value>();

const normalized = computed(() =>
	props.options.map((opt) => (typeof opt === "object" ? opt : { label: String(opt), value: opt })),
);
</script>
