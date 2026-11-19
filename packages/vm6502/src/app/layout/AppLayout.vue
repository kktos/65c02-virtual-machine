<template>
	<!--
		One grid for every layout (see useAppLayout): only grid-template-areas changes between them,
		so no slot content is moved or remounted. Floating, the grid is the video alone: the debugger panels
		are taken out of it (position: fixed) and float over it.
	-->
	<div
		ref="root"
		class="grid h-screen overflow-hidden"
		:class="dragging && (dragging === 'col' ? 'cursor-col-resize select-none' : 'cursor-row-resize select-none')"
		:style="gridStyle"
	>
		<div
			class="[grid-area:video] flex flex-col min-w-0 min-h-0 overflow-hidden bg-[conic-gradient(#000_0_25%,#333_0_50%,#000_0_75%,#333_0_100%)] [background-size:1rem_1rem]"
		>
			<!-- Floating, the header is the top bar: the debugger toolbar is teleported beside the machine one -->
			<div ref="header" class="flex shrink-0 flex-wrap bg-gray-800">
				<div class="min-w-0 flex-1" :class="floating && 'basis-0 min-w-80'">
					<slot name="video-header" />
				</div>
				<div
					v-show="floating"
					:id="LAYOUT_TOOLBAR_ID"
					class="min-w-80 flex-1 basis-0 border-l border-gray-700"
				></div>
			</div>
			<div class="relative flex-1 min-h-0">
				<slot name="video" />
			</div>
		</div>

		<div
			v-if="!floating"
			class="[grid-area:vsplit]"
			:class="handleClass('col')"
			role="separator"
			aria-orientation="vertical"
			aria-label="Video width"
			:aria-valuenow="Math.round(col * 100)"
			aria-valuemin="0"
			aria-valuemax="100"
			tabindex="0"
			title="Drag to resize · double-click: fit the video to the top row height"
			@pointerdown="startDrag('col', $event)"
			@dblclick="fit('col')"
			@keydown="onKey('col', $event)"
		></div>

		<LayoutPanel
			id="state"
			class="[grid-area:state]"
			title="Registers"
			:floating="floating"
			:bounds="{ width, height }"
			resize="height"
			:min-height="MIN_STATE"
		>
			<slot name="state" />
		</LayoutPanel>

		<!--
			Floating only: docked, the stack and the trace are in the state panel. Their content is
			teleported here (see layoutTargets): the targets must stay in the DOM, hence v-show, not v-if.
		-->
		<LayoutPanel
			v-show="floating"
			id="stack"
			title="Stack"
			:floating="floating"
			:bounds="{ width, height }"
			resize="height"
			:min-height="MIN_CODE"
		>
			<div :id="STACK_PANEL_ID" class="h-full"></div>
		</LayoutPanel>
		<LayoutPanel
			v-show="floating"
			id="trace"
			title="Execution trace"
			:floating="floating"
			:bounds="{ width, height }"
			:min-width="MIN_RIGHT"
			:min-height="MIN_CODE"
		>
			<div :id="TRACE_PANEL_ID" class="h-full"></div>
		</LayoutPanel>

		<div
			v-if="!floating"
			class="[grid-area:hsplit]"
			:class="handleClass('row')"
			role="separator"
			aria-orientation="horizontal"
			aria-label="Debugger state height"
			:aria-valuenow="Math.round(row * 100)"
			aria-valuemin="0"
			aria-valuemax="100"
			tabindex="0"
			title="Drag to resize · double-click: fit the row to the video height"
			@pointerdown="startDrag('row', $event)"
			@dblclick="fit('row')"
			@keydown="onKey('row', $event)"
		></div>

		<LayoutPanel
			id="code"
			class="[grid-area:code]"
			title="Disassembly"
			:floating="floating"
			:bounds="{ width, height }"
			:min-width="MIN_RIGHT"
			:min-height="MIN_CODE"
		>
			<slot name="code" />
		</LayoutPanel>

		<!-- Floating only: docked, the memory viewer is a tab of the code panel -->
		<LayoutPanel
			v-if="floating"
			id="memory"
			title="Memory"
			:floating="floating"
			:bounds="{ width, height }"
			:min-width="MIN_RIGHT"
			:min-height="MIN_CODE"
		>
			<slot name="memory" />
		</LayoutPanel>

		<!-- Floating only: the debugger menu opens the panels closed with their close box -->
		<DebuggerMenu v-if="floating" :bounds="{ width, height }" />
	</div>
</template>

<script setup lang="ts">
import { useElementSize } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { autoLayout, type GridKind, type LayoutKind, useAppLayout } from "@/composables/useAppLayout";
import LayoutPanel from "./LayoutPanel.vue";
import DebuggerMenu from "./DebuggerMenu.vue";
import { LAYOUT_TOOLBAR_ID, STACK_PANEL_ID, TRACE_PANEL_ID } from "./layoutTargets";

const props = defineProps<{
	/** Video width / height */
	aspect: number;
}>();

const { mode, col, row, kind, save } = useAppLayout();

type Split = "col" | "row";

// Smallest sizes the splits leave (px)
const MIN_VIDEO = 160;
const MIN_RIGHT = 320;
const MIN_STATE = 120;
const MIN_CODE = 160;

const root = ref<HTMLElement | null>(null);
const header = ref<HTMLElement | null>(null);
const { width, height } = useElementSize(root);
const { height: headerHeight } = useElementSize(header, undefined, { box: "border-box" });

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
const colPx = computed(() => Math.round(clamp(col.value * width.value, MIN_VIDEO, width.value - MIN_RIGHT)));
const rowPx = computed(() => Math.round(clamp(row.value * height.value, MIN_STATE, height.value - MIN_CODE)));

// While a split is dragged, the layout stays as it was: it's evaluated again on release
const dragging = ref<Split | null>(null);
const autoKind = ref<GridKind>(kind.value === "floating" ? "column" : kind.value);
watch(
	[colPx, rowPx, () => props.aspect, headerHeight, dragging],
	() => {
		if (dragging.value || width.value === 0) return;
		autoKind.value = autoLayout(colPx.value, rowPx.value, props.aspect, headerHeight.value);
	},
	{ immediate: true },
);

const layout = computed<LayoutKind>(() => (mode.value === "auto" ? autoKind.value : mode.value));
watch(layout, (value) => (kind.value = value), { immediate: true });
const floating = computed(() => layout.value === "floating");

const AREAS: Record<LayoutKind, string> = {
	column: `"video vsplit state" "video vsplit hsplit" "video vsplit code"`,
	top: `"video vsplit state" "hsplit hsplit hsplit" "code code code"`,
	floating: `"video"`,
};

const gridStyle = computed(() =>
	floating.value
		? {
				gridTemplateColumns: "minmax(0, 1fr)",
				gridTemplateRows: "minmax(0, 1fr)",
				gridTemplateAreas: AREAS.floating,
			}
		: {
				gridTemplateColumns: `${colPx.value}px 1px minmax(0, 1fr)`,
				gridTemplateRows: `${rowPx.value}px 1px minmax(0, 1fr)`,
				gridTemplateAreas: AREAS[layout.value],
			},
);

// 1px line, with a wider invisible grab area over the neighbours
const handleClass = (split: Split) => [
	"relative z-10 bg-gray-700 outline-none transition-colors hover:bg-cyan-500 focus-visible:bg-cyan-500 after:absolute",
	split === "col"
		? "cursor-col-resize after:inset-y-0 after:-left-1 after:-right-1"
		: "cursor-row-resize after:inset-x-0 after:-top-1 after:-bottom-1",
	dragging.value === split && "bg-cyan-500",
];

const setSplit = (split: Split, px: number) => {
	if (split === "col") col.value = width.value ? px / width.value : col.value;
	else row.value = height.value ? px / height.value : row.value;
};

const startDrag = (split: Split, event: PointerEvent) => {
	if (event.button !== 0 || !root.value) return;
	const handle = event.currentTarget as HTMLElement;
	const box = root.value.getBoundingClientRect();
	handle.setPointerCapture(event.pointerId);
	dragging.value = split;

	const onMove = (e: PointerEvent) => {
		setSplit(split, split === "col" ? e.clientX - box.left : e.clientY - box.top);
	};
	const onUp = () => {
		handle.removeEventListener("pointermove", onMove);
		handle.removeEventListener("pointerup", onUp);
		handle.removeEventListener("pointercancel", onUp);
		dragging.value = null;
		// Store the clamped position, not where the pointer went past the limits
		setSplit(split, split === "col" ? colPx.value : rowPx.value);
		save();
	};
	handle.addEventListener("pointermove", onMove);
	handle.addEventListener("pointerup", onUp);
	handle.addEventListener("pointercancel", onUp);
};

/** Size a split so the video fills its area exactly: no empty band beside or below it */
const fit = (split: Split) => {
	if (split === "col") setSplit("col", (rowPx.value - headerHeight.value) * props.aspect);
	else setSplit("row", colPx.value / props.aspect + headerHeight.value);
	save();
};

const onKey = (split: Split, event: KeyboardEvent) => {
	const keys = split === "col" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
	if (event.key === "Enter") {
		event.preventDefault();
		fit(split);
		return;
	}
	const dir = keys.indexOf(event.key);
	if (dir < 0) return;
	event.preventDefault();
	const step = (event.shiftKey ? 0.1 : 0.01) * (dir === 0 ? -1 : 1);
	const total = split === "col" ? width.value : height.value;
	setSplit(split, (split === "col" ? colPx.value : rowPx.value) + step * total);
	save();
};
</script>
