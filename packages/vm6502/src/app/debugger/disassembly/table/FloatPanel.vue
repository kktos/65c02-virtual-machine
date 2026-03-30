<template>
	<div ref="panel" class="absolute z-[10] select-none" :style="panelStyle">
		<div v-if="show" class="cursor-move relative group">
			<div
				v-if="hasTitleBar"
				class="flex items-center text-white py-[0.2rem] px-1 w-full"
				:style="{ backgroundColor: settings.floatingWindows.titleBarFocusedBg }"
			>
				<div class="flex-grow text-[0.65rem] font-bold uppercase tracking-tight">{{ title }}</div>
				<button
					v-if="closable"
					@click.stop="show = false"
					class="hover:text-cyan-300 hover:bg-gray-700 rounded transition-colors"
					title="Hide panel"
				>
					<X class="h-3 w-3" />
				</button>
			</div>
			<div>
				<slot :isDragging="isDragging" />
			</div>
		</div>
		<button
			v-else-if="closable"
			@click.stop="show = true"
			class="p-1 bg-gray-800/80 border border-gray-600 rounded shadow-lg text-gray-400 hover:text-white transition-colors cursor-pointer backdrop-blur-sm"
			title="Restore panel"
		>
			<span class="text-[0.6rem] px-0.5">◱</span>
		</button>
	</div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { useDraggable, useElementBounding } from "@vueuse/core";
import { X } from "lucide-vue-next";
import { useSettings } from "@/composables/useSettings";

const {
	closable = false,
	title = "",
	initialPos,
} = defineProps<{
	initialPos: { right: string; top: string };
	closable?: boolean;
	title?: string;
}>();

const show = defineModel<boolean>("show", { default: true });

const hasTitleBar = computed(() => !!title || closable);
const panelRef = useTemplateRef<HTMLElement>("panel");
const containerElement = computed(() => panelRef.value?.parentElement);

const containerBounds = useElementBounding(containerElement);
const panelBounds = useElementBounding(panelRef);
const { x, y, isDragging } = useDraggable(panelRef, { containerElement });

let lastPosition = initialPos;

const { settings } = useSettings();

/**
 * Calculates the CSS position (right/top) based on draggable coordinates.
 * This allows the panel to stay relative to the container even if the container resizes.
 */
const panelStyle = computed(() => {
	if (!x.value || !y.value || !containerBounds.width.value) {
		return lastPosition;
	}

	lastPosition = {
		right: `${containerBounds.width.value - x.value - panelBounds.width.value}px`,
		top: `${y.value}px`,
	};

	return lastPosition;
});
</script>
