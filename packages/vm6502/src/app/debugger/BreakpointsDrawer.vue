<template>
	<!-- Same red dot as the breakpoint markers in the disassembly gutter -->
	<button
		@click="isOpen = !isOpen"
		class="toolbar-btn px-2"
		:class="{ 'bg-gray-700 text-cyan-300': isOpen }"
		:aria-pressed="isOpen"
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
		Non-modal: no overlay, no focus trap, clicking outside does not close it,
		so breakpoints can still be toggled from the disassembly gutter and the CPU stepped while it is open.
		It opens below the debugger toolbar (top = toolbar bottom) so Run/Step stay reachable.
		Translucent black + blur so it reads as a layer above the (gray) debugger panels.
	-->
	<Sheet v-model:open="isOpen" :modal="false">
		<SheetContent
			side="right"
			:show-close="false"
			class="gap-0 h-auto w-[22rem] max-w-full sm:max-w-[22rem] bg-black/75 backdrop-blur-md border-l border-cyan-500/40 text-gray-100 shadow-2xl shadow-black"
			:style="{ top: `${top}px` }"
			@interact-outside.prevent
			@open-auto-focus.prevent
		>
			<SheetHeader class="flex-row items-center gap-1 p-1 pl-3 border-b border-gray-700/70 shrink-0">
				<SheetTitle class="text-[0.65rem] font-semibold text-cyan-400 uppercase tracking-wider">
					Breakpoints
				</SheetTitle>
				<SheetDescription class="sr-only">Manage PC and memory access breakpoints</SheetDescription>
				<button
					@click="listRef?.createBreakpoint()"
					class="toolbar-btn px-2 ml-auto h-7 bg-cyan-700 text-white hover:bg-cyan-600"
					title="Add a breakpoint"
				>
					<Plus class="h-4 w-4" />
					Add
				</button>
				<div class="toolbar-sep"></div>
				<button @click="isOpen = false" class="toolbar-btn" title="Close">
					<X class="h-4 w-4" />
				</button>
			</SheetHeader>
			<BreakpointsList ref="listRef" class="flex-1 min-h-0" />
		</SheetContent>
	</Sheet>
</template>

<script lang="ts" setup>
import { Circle, Plus, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBreakpoints } from "@/composables/useBreakpoints";
import BreakpointsList from "./BreakpointsList.vue";

/** Viewport y where the drawer starts (bottom edge of the debugger toolbar). */
const { top = 0 } = defineProps<{ top?: number }>();

const isOpen = ref(false);
const listRef = ref<InstanceType<typeof BreakpointsList> | null>(null);

const { breakpoints } = useBreakpoints();
const enabledCount = computed(() => breakpoints.value.filter((bp) => bp.enabled).length);
const buttonTitle = computed(() => {
	const total = breakpoints.value.length;
	if (total === 0) return "Breakpoints";
	return `Breakpoints (${enabledCount.value} enabled / ${total})`;
});
</script>
