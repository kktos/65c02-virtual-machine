<!--
  SettingRow — label + right-side control
  The row is a <label> so clicking anywhere toggles a checkbox. For other controls (segments,
  inputs) pass tag="div": a <label> would forward clicks on its text to the first button.
-->
<template id="SettingRow">
	<component
		:is="tag"
		class="flex items-center justify-between px-3 py-[5px] border-b border-[#181818] hover:bg-[#141414] transition-colors group"
		:class="{ 'cursor-pointer': tag === 'label' }"
	>
		<span class="text-[#b0b0b0] group-hover:text-white transition-colors truncate pr-2">
			{{ label }}
		</span>
		<div v-if="$slots.info" class="text-[#b0b0b0] group-hover:text-white transition-colors">
			<slot name="info" />
		</div>
		<div class="shrink-0">
			<slot />
		</div>
	</component>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{ label?: string; tag?: "label" | "div" }>(), { tag: "label" });
</script>
