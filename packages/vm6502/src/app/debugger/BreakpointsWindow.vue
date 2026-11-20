<template>
	<!-- Same red dot as the breakpoint markers in the disassembly gutter -->
	<button
		@click="bpWindow?.toggle()"
		class="toolbar-btn px-2"
		:class="{ 'bg-gray-700 text-cyan-300': bpWindow?.isOpen }"
		:aria-pressed="bpWindow?.isOpen"
		:title="buttonTitle"
	>
		<Circle class="h-3.5 w-3.5 fill-red-500 text-red-500" />
		<span class="hidden @[35rem]:inline">BPs</span>
		<!-- Enabled count, inline (an overlaid badge would hide the dot) -->
		<span
			v-if="enabledCount > 0"
			class="min-w-4 h-4 px-1 rounded-full bg-cyan-500 text-gray-950 text-[0.65rem] leading-4 font-bold text-center"
		>
			{{ enabledCount }}
		</span>
	</button>

	<!--
		A tool window, in every layout (the floating layout's debugger menu opens it too).
		Non-modal: breakpoints can still be toggled from the disassembly gutter and the CPU stepped while it is open.
		First opened against the right edge, below the toolbars.
	-->
	<FloatingWindow
		ref="bpWindow"
		:id="BREAKPOINTS_WINDOW_ID"
		title="Breakpoints"
		:options="{
			defaultWidth: WIDTH,
			defaultHeight: 360,
			defaultX: Math.max(0, windowWidth - WIDTH),
			defaultY: 80,
			minWidth: 280,
			minHeight: 150,
			contentScrollable: false,
		}"
	>
		<template #icon>
			<Circle class="h-3.5 w-3.5 fill-red-500 text-red-500" />
		</template>
		<!-- New breakpoints are added from the end of the list -->
		<BreakpointsList class="h-full" />
	</FloatingWindow>
</template>

<script lang="ts">
/** The floating window id (the debugger menu opens it by this id) */
export const BREAKPOINTS_WINDOW_ID = "breakpoints";
</script>

<script lang="ts" setup>
import { Circle } from "lucide-vue-next";
import { computed, ref } from "vue";
import FloatingWindow from "@/components/FloatingWindow.vue";
import { useBreakpoints } from "@/composables/useBreakpoints";
import BreakpointsList from "./BreakpointsList.vue";

const WIDTH = 352;
const windowWidth = window.innerWidth;

const bpWindow = ref<InstanceType<typeof FloatingWindow> | null>(null);

const { breakpoints } = useBreakpoints();
const enabledCount = computed(() => breakpoints.value.filter((bp) => bp.enabled).length);
const buttonTitle = computed(() => {
	const total = breakpoints.value.length;
	if (total === 0) return "Breakpoints";
	return `Breakpoints (${enabledCount.value} enabled / ${total})`;
});
</script>
