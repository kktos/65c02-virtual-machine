<template>
	<!--
		Rendered in every layout, so the slot content keeps its element (no remount, scroll kept):
		docked, it's a plain grid cell; floating, it's moved out of the grid (fixed) and gets a title bar.
		No transform / filter / backdrop-filter here: they'd become the containing block of the
		position: fixed elements inside (the maximized disassembly…).
	-->
	<div
		class="min-w-0 min-h-0 flex flex-col"
		:class="
			floating ? 'floating-panel fixed rounded-md border border-gray-600 bg-black shadow-2xl' : 'overflow-hidden'
		"
		:style="floating ? floatingStyle : undefined"
		@pointerdown.capture="floating && raise()"
	>
		<div
			v-if="floating"
			class="flex h-6 shrink-0 cursor-move select-none items-center gap-1.5 rounded-t-md bg-gray-800 pl-2 pr-1 text-[11px] font-medium uppercase tracking-wider text-gray-400"
			:class="!geometry.collapsed && 'border-b border-gray-700'"
			title="Drag to move · double-click: collapse / expand"
			@pointerdown="startDrag"
			@dblclick="toggleCollapsed"
		>
			<GripHorizontal class="h-3.5 w-3.5 shrink-0 text-gray-500" />
			<span class="truncate">{{ title }}</span>
			<button
				class="ml-auto rounded p-0.5 text-gray-400 hover:bg-gray-700 hover:text-cyan-300"
				:title="geometry.collapsed ? 'Expand' : 'Collapse'"
				@pointerdown.stop
				@dblclick.stop
				@click="toggleCollapsed"
			>
				<ChevronDown v-if="geometry.collapsed" class="h-3.5 w-3.5" />
				<ChevronUp v-else class="h-3.5 w-3.5" />
			</button>
		</div>

		<div
			v-show="!(floating && geometry.collapsed)"
			class="flex-1 min-h-0 min-w-0"
			:class="floating && 'overflow-hidden rounded-b-md'"
		>
			<slot />
		</div>

		<template v-if="floating && !geometry.collapsed">
			<div
				v-for="edge in EDGES"
				:key="edge"
				class="absolute z-10"
				:class="EDGE_CLASS[edge]"
				@pointerdown="startResize(edge, $event)"
			></div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronUp, GripHorizontal } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { type PanelId, useAppLayout } from "@/composables/useAppLayout";
import { useFloatingWindows } from "@/composables/useFloatingWindows";

const props = defineProps<{
	id: PanelId;
	title: string;
	floating: boolean;
	/** The area the panel floats over (the layout's size, px) */
	bounds: { width: number; height: number };
	minWidth: number;
	minHeight: number;
}>();

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const EDGES: Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
// Grab areas straddling the border: half outside, so they don't cover the content's scrollbars
const EDGE_CLASS: Record<Edge, string> = {
	n: "-top-1 inset-x-2 h-2 cursor-ns-resize",
	s: "-bottom-1 inset-x-2 h-2 cursor-ns-resize",
	e: "-right-1 inset-y-2 w-2 cursor-ew-resize",
	w: "-left-1 inset-y-2 w-2 cursor-ew-resize",
	ne: "-top-1 -right-1 h-3 w-3 cursor-nesw-resize",
	sw: "-bottom-1 -left-1 h-3 w-3 cursor-nesw-resize",
	nw: "-top-1 -left-1 h-3 w-3 cursor-nwse-resize",
	se: "-bottom-1 -right-1 h-3 w-3 cursor-nwse-resize",
};

/** The title bar's height (h-6) + the borders: a collapsed panel's height */
const TITLE_HEIGHT = 26;
/** Distance under which a moved or resized edge sticks to the window's edge (px) */
const SNAP = 12;

const { panels, opacity, revealed, save } = useAppLayout();
const { nextZIndex } = useFloatingWindows();

const geometry = computed(() => panels[props.id]);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));

/** The panel in px, kept inside the bounds whatever the window size */
const rect = computed(() => {
	const { width: W, height: H } = props.bounds;
	const g = geometry.value;
	const w = clamp(g.w * W, Math.min(props.minWidth, W), W);
	const h = g.collapsed ? TITLE_HEIGHT : clamp(g.h * H, Math.min(props.minHeight, H), H);
	return { x: clamp(g.x * W, 0, W - w), y: clamp(g.y * H, 0, H - h), w, h };
});

const zIndex = ref(0);
const raise = () => {
	zIndex.value = nextZIndex();
};
// Above the floating windows already open when the panels show up
watch(
	() => props.floating,
	(floating) => floating && raise(),
	{ immediate: true },
);

// Asked for (a jump to the disassembly / memory…): to the front, expanded
watch(revealed, (value) => {
	if (!props.floating || value?.id !== props.id) return;
	raise();
	if (geometry.value.collapsed) toggleCollapsed();
});

const floatingStyle = computed(() => ({
	left: `${rect.value.x}px`,
	top: `${rect.value.y}px`,
	width: `${rect.value.w}px`,
	height: geometry.value.collapsed ? "auto" : `${rect.value.h}px`,
	zIndex: zIndex.value,
	"--panel-opacity": opacity.value,
}));

const store = (x: number, y: number, w: number, h: number) => {
	const { width: W, height: H } = props.bounds;
	if (!W || !H) return;
	const g = geometry.value;
	g.x = x / W;
	g.y = y / H;
	g.w = w / W;
	if (!g.collapsed) g.h = h / H;
};

const toggleCollapsed = () => {
	geometry.value.collapsed = !geometry.value.collapsed;
	save();
};

/** Follow the pointer until it's released, then save */
const track = (event: PointerEvent, onMove: (dx: number, dy: number) => void) => {
	if (event.button !== 0) return;
	event.preventDefault();
	const target = event.currentTarget as HTMLElement;
	const startX = event.clientX;
	const startY = event.clientY;
	target.setPointerCapture(event.pointerId);

	const move = (e: PointerEvent) => onMove(e.clientX - startX, e.clientY - startY);
	const up = () => {
		target.removeEventListener("pointermove", move);
		target.removeEventListener("pointerup", up);
		target.removeEventListener("pointercancel", up);
		save();
	};
	target.addEventListener("pointermove", move);
	target.addEventListener("pointerup", up);
	target.addEventListener("pointercancel", up);
};

const snap = (value: number, max: number) => (value < SNAP ? 0 : max - value < SNAP ? max : value);

const startDrag = (event: PointerEvent) => {
	const start = { ...rect.value };
	track(event, (dx, dy) => {
		const { width: W, height: H } = props.bounds;
		const x = snap(clamp(start.x + dx, 0, W - start.w), W - start.w);
		const y = snap(clamp(start.y + dy, 0, H - start.h), H - start.h);
		store(x, y, start.w, start.h);
	});
};

const startResize = (edge: Edge, event: PointerEvent) => {
	const start = { ...rect.value };
	track(event, (dx, dy) => {
		const { width: W, height: H } = props.bounds;
		let left = start.x;
		let top = start.y;
		let right = start.x + start.w;
		let bottom = start.y + start.h;
		if (edge.includes("w")) left = snap(clamp(left + dx, 0, right - props.minWidth), W);
		if (edge.includes("e")) right = snap(clamp(right + dx, left + props.minWidth, W), W);
		if (edge.includes("n")) top = snap(clamp(top + dy, 0, bottom - props.minHeight), H);
		if (edge.includes("s")) bottom = snap(clamp(bottom + dy, top + props.minHeight, H), H);
		store(left, top, right - left, bottom - top);
	});
};
</script>

<style scoped>
/* Always see-through, so the screen behind shows */
.floating-panel {
	opacity: var(--panel-opacity);
}
</style>
