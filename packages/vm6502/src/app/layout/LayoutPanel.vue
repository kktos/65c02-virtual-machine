<template>
	<!--
		Rendered in every layout, so the slot content keeps its element (no remount, scroll kept):
		docked, it's a plain grid cell; floating, it's moved out of the grid (fixed) and gets a title bar.
		Closed, it's only hidden (display: none): the content stays mounted, the debugger menu opens it again.
		No transform / filter / backdrop-filter here: they'd become the containing block of the
		position: fixed elements inside.
	-->
	<div
		ref="el"
		class="min-w-0 min-h-0 flex flex-col"
		:class="
			floating ? 'floating-panel fixed rounded-md border border-gray-600 bg-black shadow-2xl' : 'overflow-hidden'
		"
		:style="floating ? floatingStyle : undefined"
		@pointerdown.capture="floating && raise()"
	>
		<div
			v-if="floating"
			class="flex h-6 shrink-0 cursor-move select-none items-center gap-1.5 rounded-t-md border-b border-gray-700 bg-gray-800 pl-2 pr-1 text-[11px] font-medium uppercase tracking-wider text-gray-400"
			title="Drag to move"
			@pointerdown="startDrag"
		>
			<GripHorizontal class="h-3.5 w-3.5 shrink-0 text-gray-500" />
			<span class="truncate">{{ title }}</span>
			<button
				class="ml-auto rounded p-0.5 text-gray-400 hover:bg-gray-700 hover:text-cyan-300"
				title="Close · the debugger menu opens it again"
				@pointerdown.stop
				@click="setPanelOpen(id, false)"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</div>

		<div class="flex-1 min-h-0 min-w-0" :class="floating && 'overflow-hidden rounded-b-md'">
			<slot />
		</div>

		<template v-if="floating">
			<div
				v-for="edge in edges"
				:key="edge"
				class="absolute z-10"
				:class="EDGE_CLASS[edge]"
				@pointerdown="startResize(edge, $event)"
			></div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { GripHorizontal, X } from "lucide-vue-next";
import { useElementSize } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { type PanelId, useAppLayout } from "@/composables/useAppLayout";
import { useFloatingWindows } from "@/composables/useFloatingWindows";
import { clamp, snapToEdge as snap, trackPointer } from "./trackPointer";

const props = defineProps<{
	id: PanelId;
	title: string;
	floating: boolean;
	/** The area the panel floats over (the layout's size, px) */
	bounds: { width: number; height: number };
	minWidth?: number;
	minHeight?: number;
	/**
	 * What the user can resize: "height" only, the width fits the content (its widest row); "width" only,
	 * the height fits the content; "both" (the default)
	 */
	resize?: "both" | "width" | "height";
}>();

const resize = computed(() => props.resize ?? "both");
/** The size follows the content on that axis: no stored value, no handle */
const fitWidth = computed(() => resize.value === "height");
const fitHeight = computed(() => resize.value === "width");
const minWidth = computed(() => props.minWidth ?? 0);
const minHeight = computed(() => props.minHeight ?? 0);

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
const edges = computed(() =>
	EDGES.filter((edge) =>
		fitWidth.value ? edge === "n" || edge === "s" : fitHeight.value ? edge === "e" || edge === "w" : true,
	),
);

const { panels, opacity, revealed, setPanelOpen, save } = useAppLayout();
const { nextZIndex } = useFloatingWindows();

const geometry = computed(() => panels[props.id]);

// The panel's own size: the content's, on the axis that fits it
const el = ref<HTMLElement | null>(null);
const natural = useElementSize(el, undefined, { box: "border-box" });

/** The panel in px, kept inside the bounds whatever the window size */
const rect = computed(() => {
	const { width: W, height: H } = props.bounds;
	const g = geometry.value;
	// Not measured yet (just shown): the stored size meanwhile
	const fitW = fitWidth.value && natural.width.value > 0;
	const fitH = fitHeight.value && natural.height.value > 0;
	const w = fitW ? Math.min(natural.width.value, W) : clamp(g.w * W, Math.min(minWidth.value, W), W);
	const h = fitH ? Math.min(natural.height.value, H) : clamp(g.h * H, Math.min(minHeight.value, H), H);
	return { x: clamp(g.x * W, 0, W - w), y: clamp(g.y * H, 0, H - h), w, h };
});

const zIndex = ref(0);
const raise = () => {
	zIndex.value = nextZIndex();
};
// Above the floating windows already open when the panels show up, or when it's opened again
watch(
	() => props.floating && geometry.value.open,
	(shown) => shown && raise(),
	{ immediate: true },
);

// Asked for (a jump to the disassembly / memory…): opened, to the front
watch(revealed, (value) => {
	if (!props.floating || value?.id !== props.id) return;
	raise();
	if (!geometry.value.open) setPanelOpen(props.id, true);
});

const floatingStyle = computed(() => ({
	left: `${rect.value.x}px`,
	top: `${rect.value.y}px`,
	// Fitted: as wide (tall) as the content, wherever the panel is (auto would shrink it near the right edge)
	width: fitWidth.value ? "max-content" : `${rect.value.w}px`,
	height: fitHeight.value ? "max-content" : `${rect.value.h}px`,
	maxWidth: fitWidth.value ? `${props.bounds.width}px` : undefined,
	maxHeight: fitHeight.value ? `${props.bounds.height}px` : undefined,
	zIndex: zIndex.value,
	// Plays along with a v-show on the component (stack / trace): either one hides it
	...(geometry.value.open ? {} : { display: "none" }),
	"--panel-opacity": opacity.value,
}));

const store = (x: number, y: number, w: number, h: number) => {
	const { width: W, height: H } = props.bounds;
	if (!W || !H) return;
	const g = geometry.value;
	g.x = x / W;
	g.y = y / H;
	g.w = w / W;
	g.h = h / H;
};

/** Follow the pointer until it's released, then save */
const track = (event: PointerEvent, onMove: (dx: number, dy: number) => void) => trackPointer(event, onMove, save);

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
		if (edge.includes("w")) left = snap(clamp(left + dx, 0, right - minWidth.value), W);
		if (edge.includes("e")) right = snap(clamp(right + dx, left + minWidth.value, W), W);
		if (edge.includes("n")) top = snap(clamp(top + dy, 0, bottom - minHeight.value), H);
		if (edge.includes("s")) bottom = snap(clamp(bottom + dy, top + minHeight.value, H), H);
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
