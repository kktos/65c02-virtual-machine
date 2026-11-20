<template>
	<!--
		The floating layout's debugger menu, after the NeXTSTEP menus, in the floating panels' colours:
		a title bar to drag it, one item per panel below. An item opens or closes its panel; open ones
		get a green dot (an empty ring when closed: same size, so the rows never move). Trace gets
		a red one at the end while tracing.
		Below a divider, the tool windows that go with them (the breakpoints, with their enabled count).
		Always above the panels (the overlay z-index), it can't get lost under them.
	-->
	<nav
		ref="el"
		class="fixed w-28 select-none overflow-hidden rounded-md border border-gray-600 bg-black text-[11px] shadow-2xl"
		:style="style"
		aria-label="Debugger"
	>
		<div
			class="flex h-6 cursor-move items-center border-b border-gray-700 bg-gray-800 px-2 font-medium uppercase tracking-wider text-gray-400"
			title="Drag to move"
			@pointerdown="startDrag"
		>
			Debugger
		</div>
		<button
			v-for="(item, index) in ITEMS"
			:key="item.id"
			class="flex h-6 w-full items-center gap-2 px-2 text-left text-gray-300 hover:bg-gray-700 hover:text-cyan-300"
			:class="{ 'border-b border-gray-800': index < ITEMS.length - 1 }"
			:title="`${panels[item.id].open ? 'Close' : 'Open'} the ${item.title} panel`"
			:aria-pressed="panels[item.id].open"
			@click="toggle(item.id)"
		>
			<span
				class="h-2 w-2 shrink-0 rounded-full border"
				:class="panels[item.id].open ? 'border-green-500 bg-green-500' : 'border-gray-500'"
			></span>
			{{ item.label }}
			<!-- Tracing slows the CPU and goes on with the panel closed: say so here -->
			<span
				v-if="item.id === 'trace' && traceEnabled"
				class="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500"
				title="Tracing"
			></span>
		</button>
		<div class="border-t border-gray-600"></div>
		<button
			class="flex h-6 w-full items-center gap-2 px-2 text-left text-gray-300 hover:bg-gray-700 hover:text-cyan-300"
			:title="`${breakpointsOpen ? 'Close' : 'Open'} the breakpoints window`"
			:aria-pressed="breakpointsOpen"
			@click="toggleWindow(BREAKPOINTS_WINDOW_ID)"
		>
			<span
				class="h-2 w-2 shrink-0 rounded-full border"
				:class="breakpointsOpen ? 'border-green-500 bg-green-500' : 'border-gray-500'"
			></span>
			Breakpoints
			<span v-if="enabledCount > 0" class="ml-auto font-bold text-cyan-400" title="Enabled breakpoints">
				{{ enabledCount }}
			</span>
		</button>
	</nav>
</template>

<script setup lang="ts">
import { useElementSize } from "@vueuse/core";
import { computed, ref } from "vue";
import { BREAKPOINTS_WINDOW_ID } from "@/app/debugger/BreakpointsWindow.vue";
import { type PanelId, useAppLayout } from "@/composables/useAppLayout";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useFloatingWindows } from "@/composables/useFloatingWindows";
import { useMachine } from "@/composables/useMachine";
import { clamp, snapToEdge, trackPointer } from "./trackPointer";

const props = defineProps<{
	/** The area the menu floats over (the layout's size, px) */
	bounds: { width: number; height: number };
}>();

const ITEMS: { id: PanelId; label: string; title: string }[] = [
	{ id: "state", label: "Registers", title: "registers" },
	{ id: "stack", label: "Stack", title: "stack" },
	{ id: "trace", label: "Trace", title: "execution trace" },
	{ id: "code", label: "Disassembly", title: "disassembly" },
	{ id: "memory", label: "Memory", title: "memory" },
];

const { panels, menu, setPanelOpen, save } = useAppLayout();
const { overlayZIndex, isOpen: isWindowOpen, toggle: toggleWindow } = useFloatingWindows();
const { traceEnabled } = useMachine();
const { breakpoints } = useBreakpoints();

const breakpointsOpen = computed(() => isWindowOpen(BREAKPOINTS_WINDOW_ID));
const enabledCount = computed(() => breakpoints.value.filter((bp) => bp.enabled).length);

const el = ref<HTMLElement | null>(null);
const { width, height } = useElementSize(el, undefined, { box: "border-box" });

/** The room the menu can move in: its position is stored as a fraction of it (1: flush right / bottom) */
const room = computed(() => ({
	x: Math.max(0, props.bounds.width - width.value),
	y: Math.max(0, props.bounds.height - height.value),
}));

const style = computed(() => ({
	left: `${menu.x * room.value.x}px`,
	top: `${menu.y * room.value.y}px`,
	zIndex: overlayZIndex.value,
}));

const toggle = (id: PanelId) => setPanelOpen(id, !panels[id].open);

const startDrag = (event: PointerEvent) => {
	const start = { x: menu.x * room.value.x, y: menu.y * room.value.y };
	trackPointer(
		event,
		(dx, dy) => {
			const { x: X, y: Y } = room.value;
			menu.x = X ? snapToEdge(clamp(start.x + dx, 0, X), X) / X : 0;
			menu.y = Y ? snapToEdge(clamp(start.y + dy, 0, Y), Y) / Y : 0;
		},
		save,
	);
};
</script>
