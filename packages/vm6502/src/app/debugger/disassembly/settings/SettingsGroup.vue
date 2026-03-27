<!--
  SettingsGroup — collapsible section with a label header
-->
<template id="SettingsGroup">
	<div class="mt-0">
		<!-- Group header -->
		<button
			class="w-full bg-white/10 border-t border-gray-500 flex items-center justify-between px-3 py-1.5 text-[0.7rem] uppercase tracking-[.15em] hover:text-[#4afa8a] transition-colors group"
			@click="open = !open"
		>
			<span class="flex items-center gap-1"><Square class="w-4 h-4" />{{ label }}</span>
			<ChevronDown class="w-4 h-4 transition-transform duration-200" :class="open ? 'rotate-0' : '-rotate-90'" />
		</button>

		<!-- Group body -->
		<div v-show="open" class="flex flex-col">
			<slot />
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import { ChevronDown, Square } from "lucide-vue-next";
defineProps({
	label: String,
});
const open = ref(true);
</script>
