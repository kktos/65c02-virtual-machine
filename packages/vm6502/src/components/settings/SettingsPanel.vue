<!--
  SettingsPanel — slide-up settings drawer anchored to the bottom of a view.
  The parent must be `relative`. Content goes in the default slot (SettingsGroup/SettingRow),
  an optional reset action in the `footer` slot.
-->
<template>
	<transition
		enter-active-class="transition ease-out duration-300"
		enter-from-class="transform translate-y-full"
		enter-to-class="transform translate-y-0"
		leave-active-class="transition ease-in duration-200"
		leave-from-class="transform translate-y-0"
		leave-to-class="transform translate-y-full"
	>
		<aside
			v-if="isOpen"
			ref="panelRef"
			class="absolute bottom-0 left-0 right-0 z-20 max-h-[60%] backdrop-blur-xs flex flex-col bg-[#0e0e0e] border-l border-[#2a2a2a] font-mono text-xs select-none"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between px-3 py-2 bg-white/20 border-t-2 border-t-[#4afa8a] border-b border-[#2a2a2a] shrink-0"
			>
				<div class="tracking-widest uppercase text-xs font-bold flex items-center gap-1">
					<Settings2 class="w-4 h-4" /> {{ title }}
				</div>
				<button @click="$emit('close')" class="hover:text-[#4afa8a] transition-colors">
					<X class="w-4 h-4" />
				</button>
			</div>

			<div class="flex flex-col gap-0 pb-4 overflow-y-auto">
				<slot />
			</div>

			<div v-if="$slots.footer" class="mt-auto shrink-0 border-t border-[#2a2a2a] px-3 py-2">
				<slot name="footer" />
			</div>
		</aside>
	</transition>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Settings2, X } from "lucide-vue-next";

const props = withDefaults(
	defineProps<{
		isOpen: boolean;
		title?: string;
		/** Element (usually the toggle button) whose clicks must not count as "outside" */
		ignoreRef?: HTMLElement | null;
	}>(),
	{ title: "Settings", ignoreRef: null },
);

const emit = defineEmits<{
	(e: "close"): void;
}>();

const panelRef = ref<HTMLElement | null>(null);
onClickOutside(panelRef, () => emit("close"), {
	// Popovers opened from the panel (e.g. a color picker) are teleported out of it
	ignore: () => ["[role=dialog]", ...(props.ignoreRef ? [props.ignoreRef] : [])],
});
</script>
