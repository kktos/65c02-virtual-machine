<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { useDraggable, useElementBounding } from "@vueuse/core";

const props = defineProps<{
	initialPos: { right: string; top: string };
}>();

const panelRef = useTemplateRef<HTMLElement>("panel");
const containerElement = computed(() => panelRef.value?.parentElement);

const containerBounds = useElementBounding(containerElement);
const panelBounds = useElementBounding(panelRef);
const { x, y, isDragging } = useDraggable(panelRef, { containerElement });

let lastPosition = props.initialPos;

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

<template>
	<div ref="panel" class="absolute z-[10] cursor-move select-none" :style="panelStyle">
		<slot :isDragging="isDragging" />
	</div>
</template>
