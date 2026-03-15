<template>
	<div
		v-if="isOpen"
		ref="floatingWindow"
		:style="floatingWindowStyle"
		class="fixed flex flex-col bg-black/80 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl z-50 overflow-hidden"
		:class="windowClass"
		@mousedown="bringToFront"
	>
		<!-- Header / Drag Handle -->
		<div
			ref="dragHandle"
			@mousedown="startDrag"
			class="flex items-center justify-between px-3 py-1 bg-gray-900/70 border-b border-gray-700 cursor-move select-none shrink-0"
		>
			<div class="flex items-center gap-2 text-gray-300">
				<slot name="icon" />
				<span class="text-xs font-bold text-gray-200 uppercase tracking-wider">{{ title }}</span>
			</div>
			<div class="flex items-center gap-1">
				<slot name="header-buttons" />
				<button
					v-if="config.closable"
					@click="close"
					class="text-gray-400 hover:text-cyan-300 hover:bg-gray-700 rounded p-1 transition-colors"
					title="Close"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>

		<!-- Content Slot -->
		<div class="flex-1 relative flex flex-col" :class="{ 'overflow-auto': config.contentScrollable }">
			<slot />
		</div>

		<!-- Edge Resize Handles (when snappableResize is enabled and snapped) -->
		<div
			v-if="config.snappableResize && isSnappedBottom"
			class="absolute -top-1 left-0 right-0 h-2 cursor-row-resize hover:bg-cyan-500/50 transition-colors z-20"
			@mousedown.prevent="startResize('n', $event)"
		></div>
		<div
			v-if="config.snappableResize && isSnappedTop"
			class="absolute -bottom-1 left-0 right-0 h-2 cursor-row-resize hover:bg-cyan-500/50 transition-colors z-20"
			@mousedown.prevent="startResize('s', $event)"
		></div>
		<div
			v-if="config.snappableResize && isSnappedRight"
			class="absolute top-0 -left-1 bottom-0 w-2 cursor-col-resize hover:bg-cyan-500/50 transition-colors z-20"
			@mousedown.prevent="startResize('w', $event)"
		></div>
		<div
			v-if="config.snappableResize && isSnappedLeft"
			class="absolute top-0 -right-1 bottom-0 w-2 cursor-col-resize hover:bg-cyan-500/50 transition-colors z-20"
			@mousedown.prevent="startResize('e', $event)"
		></div>

		<!-- Resize Handle -->
		<div
			v-if="config.resizable && (!config.snappableResize || !isAnySnapped)"
			class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end z-10 text-gray-500 hover:text-cyan-300 transition-colors"
			@mousedown.prevent="startResize('se', $event)"
		>
			<MoveDiagonal class="scale-x-[-1]" />
		</div>
	</div>
</template>

<script lang="ts" setup>
import { X, MoveDiagonal } from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const SNAP_THRESHOLD = 20;

export interface FloatingWindowOptions {
	resizable?: boolean;
	contentScrollable?: boolean;
	defaultWidth?: number;
	defaultHeight?: number;
	minWidth?: number;
	minHeight?: number;
	defaultX?: number;
	defaultY?: number;
	snappable?: boolean;
	snappableResize?: boolean;
	closable?: boolean;
}

const props = defineProps<{
	title: string;
	id: string;
	options?: FloatingWindowOptions;
	windowClass?: string | Record<string, boolean> | (string | Record<string, boolean>)[];
}>();

const defaultOptions: Required<FloatingWindowOptions> = {
	resizable: true,
	contentScrollable: true,
	defaultWidth: 320,
	defaultHeight: 240,
	minWidth: 200,
	minHeight: 150,
	defaultX: 100,
	defaultY: 100,
	snappable: true,
	snappableResize: false,
	closable: true,
};

const config = computed(() => ({ ...defaultOptions, ...props.options }));
const emit = defineEmits<{
	(e: "close"): void;
	(e: "resize", size: { width: number; height: number }): void;
}>();

const isOpen = ref(false);
const floatingWindow = ref<HTMLElement | null>(null);

// State for position and size
const position = ref({ x: config.value.defaultX, y: config.value.defaultY });
const size = ref({ width: config.value.defaultWidth, height: config.value.defaultHeight });
const winSize = ref({ width: window.innerWidth, height: window.innerHeight });

const isSnappedLeft = computed(() => position.value.x <= SNAP_THRESHOLD);
const isSnappedTop = computed(() => position.value.y <= SNAP_THRESHOLD);
const isSnappedRight = computed(
	() => Math.abs(position.value.x + size.value.width - winSize.value.width) <= SNAP_THRESHOLD,
);
const isSnappedBottom = computed(
	() => Math.abs(position.value.y + size.value.height - winSize.value.height) <= SNAP_THRESHOLD,
);
const isAnySnapped = computed(
	() => isSnappedLeft.value || isSnappedTop.value || isSnappedRight.value || isSnappedBottom.value,
);

const STORAGE_KEY = computed(() => `floating-window-${props.id}`);

const floatingWindowStyle = computed(() => ({
	left: `${position.value.x}px`,
	top: `${position.value.y}px`,
	width: `${size.value.width}px`,
	height: `${size.value.height}px`,
}));

const clampToViewport = () => {
	if (!floatingWindow.value) return;

	const winWidth = winSize.value.width;
	const winHeight = winSize.value.height;

	// Ensure window is at least partially visible
	const newX = Math.min(Math.max(0, position.value.x), winWidth - 50);
	const newY = Math.min(Math.max(0, position.value.y), winHeight - 50);

	if (newX !== position.value.x || newY !== position.value.y) {
		position.value = { x: newX, y: newY };
		saveState();
	}
};

const saveState = () => {
	const state = {
		isOpen: isOpen.value,
		position: position.value,
		size: size.value,
	};
	localStorage.setItem(STORAGE_KEY.value, JSON.stringify(state));
};

const loadState = () => {
	const saved = localStorage.getItem(STORAGE_KEY.value);
	if (saved) {
		try {
			const state = JSON.parse(saved);
			if (state.position) position.value = state.position;
			if (state.size) size.value = state.size;
			if (typeof state.isOpen === "boolean") isOpen.value = state.isOpen;
		} catch (e) {
			console.error("Failed to load floating window state", e);
		}
	}
};

const open = (options?: { x?: number; y?: number; width?: number; height?: number }) => {
	if (options?.x) position.value.x = options.x;
	if (options?.y) position.value.y = options.y;
	if (options?.width) size.value.width = options.width;
	if (options?.height) size.value.height = options.height;

	isOpen.value = true;
	// Save new state if opened programmatically with new coordinates
	saveState();
	nextTick(() => clampToViewport());
};

const close = () => {
	isOpen.value = false;
	saveState();
	emit("close");
};

const toggle = () => {
	if (isOpen.value) close();
	else open();
};

const bringToFront = () => {
	// Placeholder for z-index management
};

const startDrag = (event: MouseEvent) => {
	if (event.button !== 0) return;

	const startX = event.clientX;
	const startY = event.clientY;
	const startLeft = position.value.x;
	const startTop = position.value.y;

	const doDrag = (e: MouseEvent) => {
		let nextX = startLeft + e.clientX - startX;
		let nextY = startTop + e.clientY - startY;

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		if (config.value.snappable) {
			// Snap to left/right
			if (Math.abs(nextX) < SNAP_THRESHOLD) {
				nextX = 0;
			} else if (Math.abs(nextX + size.value.width - viewportWidth) < SNAP_THRESHOLD) {
				nextX = viewportWidth - size.value.width;
			}

			// Snap to top/bottom
			if (Math.abs(nextY) < SNAP_THRESHOLD) {
				nextY = 0;
			} else if (Math.abs(nextY + size.value.height - viewportHeight) < SNAP_THRESHOLD) {
				nextY = viewportHeight - size.value.height;
			}
		}

		position.value.x = nextX;
		position.value.y = nextY;
	};

	const stopDrag = () => {
		window.removeEventListener("mousemove", doDrag);
		window.removeEventListener("mouseup", stopDrag);
		saveState();
	};

	window.addEventListener("mousemove", doDrag);
	window.addEventListener("mouseup", stopDrag);
};

const startResize = (direction: "se" | "n" | "s" | "e" | "w", event: MouseEvent) => {
	if (event.button !== 0) return;
	event.stopPropagation();

	const startX = event.clientX;
	const startY = event.clientY;
	const startLeft = position.value.x;
	const startTop = position.value.y;
	const startWidth = size.value.width;
	const startHeight = size.value.height;

	const onMouseMove = (e: MouseEvent) => {
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		let newWidth = startWidth;
		let newHeight = startHeight;
		let newX = startLeft;
		let newY = startTop;

		if (direction === "se") {
			newWidth = Math.max(config.value.minWidth, startWidth + dx);
			newHeight = Math.max(config.value.minHeight, startHeight + dy);
		} else if (direction === "n") {
			const rawHeight = startHeight - dy;
			newHeight = Math.max(config.value.minHeight, rawHeight);
			newY = startTop + (startHeight - newHeight);
		} else if (direction === "s") {
			newHeight = Math.max(config.value.minHeight, startHeight + dy);
		} else if (direction === "w") {
			const rawWidth = startWidth - dx;
			newWidth = Math.max(config.value.minWidth, rawWidth);
			newX = startLeft + (startWidth - newWidth);
		} else if (direction === "e") {
			newWidth = Math.max(config.value.minWidth, startWidth + dx);
		}

		size.value = { width: newWidth, height: newHeight };
		position.value = { x: newX, y: newY };
		emit("resize", size.value);
	};

	const onMouseUp = () => {
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("mouseup", onMouseUp);
		saveState();
	};

	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);
};

watch(
	() => props.id,
	() => {
		loadState();
		emit("resize", size.value);
	},
	{ immediate: true },
);

const updateWinSize = () => {
	winSize.value = { width: window.innerWidth, height: window.innerHeight };
	clampToViewport();
};

onMounted(() => {
	window.addEventListener("resize", updateWinSize);
});

onUnmounted(() => {
	window.removeEventListener("resize", updateWinSize);
});

defineExpose({
	open,
	close,
	toggle,
	isOpen,
});
</script>
