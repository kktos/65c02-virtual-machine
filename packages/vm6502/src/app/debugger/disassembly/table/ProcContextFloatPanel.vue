<template>
	<div
		v-if="info && settings.disassembly.showContextBadge"
		ref="badge"
		class="absolute z-[10] px-2 py-0.5 bg-gray-700/90 border-l-4 text-[0.68rem] shadow-2xl select-none backdrop-blur-md flex items-center gap-2 cursor-move active:opacity-80"
		:class="{ 'transition-all duration-300': !isDragging }"
		:style="{
			...badgeStyle,
			borderColor: info.scopeColor,
		}"
		title="Drag to move badge"
	>
		<span :style="{ color: settings.disassembly.syntax.label }" class="font-bold tracking-tight">
			{{ info.name }}
		</span>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, type Ref } from "vue";
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";
import { useDraggable, useElementBounding } from "@vueuse/core";
import { useTemplateRef } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const props = defineProps<{
	addr: number;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");
const { settings } = useSettings();
const { getLabelAtOrBefore } = useSymbols();

const badgeRef = useTemplateRef<HTMLElement>("badge");
// We use the parent element as the drag container
const containerElement = computed(() => badgeRef.value?.parentElement);

const containerBounds = useElementBounding(containerElement);
const badgeBounds = useElementBounding(badgeRef);
const { x, y, isDragging } = useDraggable(badgeRef, { containerElement });

let lastPosition = { right: "1rem", top: "2.1rem" };

const getScopeColor = (addr: number) => {
	const scope = vm?.value?.getScope(addr & 0xffff);
	if (!scope) return "";
	const color = settings.disassembly.scopeColors[scope];
	if (!color || color === "#000000" || color === "#00000000") return "";
	return color;
};

const info = computed(() => {
	const name = getLabelAtOrBefore(props.addr);
	if (!name) return null;
	return {
		name,
		scopeColor: getScopeColor(props.addr),
	};
});

const badgeStyle = computed(() => {
	if (!x.value || !y.value || !containerBounds.width.value) {
		return lastPosition;
	}

	lastPosition = {
		right: `${containerBounds.width.value - x.value - badgeBounds.width.value}px`,
		top: `${y.value}px`,
	};

	return lastPosition;
});
</script>
