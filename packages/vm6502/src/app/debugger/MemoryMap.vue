<template>
	<button
		@click="isOpen = !isOpen"
		class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 transition-colors shrink-0"
		:class="{ 'bg-gray-600 border-cyan-500/50': isOpen }"
		title="Memory Map"
	>
		<MapIcon class="h-5 w-5 text-cyan-400 group-hover:text-cyan-300" />
	</button>

	<Teleport to="body">
		<div
			v-if="isOpen"
			ref="windowRef"
			class="fixed z-50 flex flex-col bg-gray-900/95 border border-gray-700 rounded-lg shadow-2xl backdrop-blur-sm overflow-hidden resize min-w-[400px] min-h-[300px]"
			:style="{ left: `${position.x}px`, top: `${position.y}px`, width: `${size.width}px`, height: `${size.height}px` }"
		>
			<!-- Header -->
			<div
				@mousedown="startDrag"
				class="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700 cursor-move select-none"
			>
				<h3 class="text-sm font-bold text-gray-200">Memory Map</h3>
				<button @click="isOpen = false" class="text-gray-400 hover:text-white transition-colors">
					<X class="w-4 h-4" />
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-auto p-4">
				<MemoryMapContainer />
			</div>
		</div>
	</Teleport>
</template>

<script lang="ts" setup>
import { Map as MapIcon, X } from "lucide-vue-next";
import { onUnmounted, reactive, ref, watch } from "vue";
import MemoryMapContainer from "./MemoryMapContainer.vue";

const STORAGE_KEY = "vm6502_memory_map_layout";

const isOpen = ref(false);
const position = reactive({ x: 100, y: 100 });
const size = reactive({ width: 600, height: 500 });
const windowRef = ref<HTMLElement | null>(null);
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let resizeObserver: ResizeObserver | null = null;

// Load saved state
try {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved) {
		const parsed = JSON.parse(saved);
		if (Number.isFinite(parsed.x)) position.x = parsed.x;
		if (Number.isFinite(parsed.y)) position.y = parsed.y;
		if (Number.isFinite(parsed.width)) size.width = parsed.width;
		if (Number.isFinite(parsed.height)) size.height = parsed.height;
	}
} catch (e) {
	console.warn("Failed to load memory map layout", e);
}

const saveLayout = () => {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			x: position.x,
			y: position.y,
			width: size.width,
			height: size.height,
		}),
	);
};

const startDrag = (e: MouseEvent) => {
	if (windowRef.value) {
		size.width = windowRef.value.offsetWidth;
		size.height = windowRef.value.offsetHeight;
	}
	isDragging = true;
	dragStart.x = e.clientX - position.x;
	dragStart.y = e.clientY - position.y;
	window.addEventListener("mousemove", onDrag);
	window.addEventListener("mouseup", stopDrag);
};

const onDrag = (e: MouseEvent) => {
	if (!isDragging) return;
	position.x = e.clientX - dragStart.x;
	position.y = e.clientY - dragStart.y;
};

const stopDrag = () => {
	isDragging = false;
	window.removeEventListener("mousemove", onDrag);
	window.removeEventListener("mouseup", stopDrag);
	saveLayout();
};

watch(windowRef, (el) => {
	if (resizeObserver) resizeObserver.disconnect();
	if (el) {
		resizeObserver = new ResizeObserver(() => {
			size.width = el.offsetWidth;
			size.height = el.offsetHeight;
			saveLayout();
		});
		resizeObserver.observe(el);
	}
});

onUnmounted(() => {
	window.removeEventListener("mousemove", onDrag);
	window.removeEventListener("mouseup", stopDrag);
	resizeObserver?.disconnect();
});
</script>
