<!--
  CheckBox — custom phosphor-green checkbox
-->
<template id="CheckBox">
	<div class="relative flex items-center">
		<input type="checkbox" v-model="model" class="peer sr-only" />
		<div
			class="w-7 h-3.5 rounded-none bg-[#1a1a1a] border border-[#b0b0b0] group-hover:border-white transition-colors duration-150 relative"
		>
			<div
				class="absolute top-[1px] left-[1px] w-[10px] h-[10px] peer-checked:bg-[#4afa8a] peer-checked:translate-x-[14px] transition-all duration-150"
				:class="model ? 'translate-x-[14px] bg-[#4afa8a]' : 'translate-x-0 bg-[#b0b0b0]'"
			/>
		</div>
	</div>
</template>

<script lang="ts" setup>
const model = defineModel<boolean>();
</script>
