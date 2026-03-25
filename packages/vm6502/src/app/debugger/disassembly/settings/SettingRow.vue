<!--
  SettingRow — label + right-side control
-->
<template id="SettingRow">
	<label
		class="flex items-center justify-between px-3 py-[5px] border-b border-[#181818] hover:bg-[#141414] transition-colors cursor-pointer group"
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
	</label>
</template>

<script lang="ts" setup>
defineProps({
	label: String,
});
</script>
