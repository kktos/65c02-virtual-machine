<template>
	<div
		v-if="isOpen"
		ref="floatingWindow"
		:style="floatingWindowStyle"
		class="fixed flex flex-col bg-black/80 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl z-50 overflow-hidden"
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
			<button
				@click="close"
				class="text-gray-400 hover:text-cyan-300 hover:bg-gray-700 rounded p-1 transition-colors"
				title="Close"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<!-- Content Slot -->
		<div class="flex-1 relative flex flex-col" :class="{ 'overflow-auto': contentScrollable }">
			<slot />
		</div>

		<!-- Resize Handle -->
		<div
			v-if="resizable"
			class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end z-10 text-gray-500 hover:text-cyan-300 transition-colors"
			@mousedown.prevent="startResize"
		>
			<MoveDiagonal class="scale-x-[-1]" />
		</div>
	</div>
</template>

<script lang="ts" setup>
import { X, MoveDiagonal } from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const SNAP_THRESHOLD = 20;

const props = withDefaults(
	defineProps<{
		title: string;
		id: string;
		resizable?: boolean;
		contentScrollable?: boolean;
		defaultWidth?: number;
		defaultHeight?: number;
		minWidth?: number;
		minHeight?: number;
		defaultX?: number;
		defaultY?: number;
	}>(),
	{
		resizable: true,
		contentScrollable: true,
		defaultWidth: 320,
		defaultHeight: 240,
		minWidth: 200,
		minHeight: 150,
		defaultX: 100,
		defaultY: 100,
	},
);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "resize", size: { width: number; height: number }): void;
}>();

const isOpen = ref(false);
const floatingWindow = ref<HTMLElement | null>(null);

// State for position and size
const position = ref({ x: props.defaultX, y: props.defaultY });
const size = ref({ width: props.defaultWidth, height: props.defaultHeight });

const STORAGE_KEY = computed(() => `floating-window-${props.id}`);

const floatingWindowStyle = computed(() => ({
	left: `${position.value.x}px`,
	top: `${position.value.y}px`,
	width: `${size.value.width}px`,
	height: `${size.value.height}px`,
}));

const clampToViewport = () => {
	if (!floatingWindow.value) return;

	const winWidth = window.innerWidth;
	const winHeight = window.innerHeight;

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

const startResize = (event: MouseEvent) => {
	if (event.button !== 0) return;
	event.stopPropagation();

	const startX = event.clientX;
	const startY = event.clientY;
	const startWidth = size.value.width;
	const startHeight = size.value.height;

	const onMouseMove = (e: MouseEvent) => {
		const newWidth = Math.max(props.minWidth, startWidth + e.clientX - startX);
		const newHeight = Math.max(props.minHeight, startHeight + e.clientY - startY);
		size.value = { width: newWidth, height: newHeight };
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

onMounted(() => {
	window.addEventListener("resize", clampToViewport);
});

onUnmounted(() => {
	window.removeEventListener("resize", clampToViewport);
});

defineExpose({
	open,
	close,
	toggle,
	isOpen,
});
</script>
