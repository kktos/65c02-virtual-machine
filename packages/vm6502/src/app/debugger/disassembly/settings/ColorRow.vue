<!--
  ColorRow — label + hex text input + color swatch
-->
<template id="ColorRow">
	<div
		class="flex items-center justify-between px-3 py-[5px] border-b border-[#181818] hover:bg-[#141414] transition-colors group"
	>
		<span class="text-[#b0b0b0] group-hover:text-white transition-colors truncate pr-2">
			{{ label }}
		</span>

		<div class="flex items-center gap-1.5 shrink-0">
			<input
				type="text"
				v-model="model"
				maxlength="7"
				class="w-16 bg-[#181818] border border-[#2a2a2a] text-[10px] font-mono text-[#c0c0c0] px-1.5 py-0.5 focus:outline-none focus:border-[#4afa8a] focus:text-[#4afa8a] transition-colors rounded-none"
			/>
			<!-- Color swatch — clicking opens native color picker via label trick -->
			<label class="relative cursor-pointer">
				<input type="color" v-model="model" class="sr-only" />
				<div
					class="w-5 h-5 border border-[#3a3a3a] hover:border-[#4afa8a] transition-colors"
					:style="{ backgroundColor: model }"
				/>
			</label>
		</div>
	</div>
</template>
<script lang="ts" setup>
defineProps({
	label: String,
});
const model = defineModel<string>();
</script>
