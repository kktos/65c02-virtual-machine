<template>
	<div
		v-if="windowState.isVisible"
		class="absolute flex flex-col bg-gray-800/80 text-green-400 border border-gray-700 backdrop-blur-sm rounded-lg shadow-lg"
		:style="{
			left: `${position.x}px`,
			top: `${position.y}px`,
			width: `${size.width}px`,
			height: `${size.height}px`,
			zIndex: windowState.zIndex,
		}"
		@mousedown="onMouseDown"
	>
		<!-- Header / Drag Handle -->
		<div
			class="flex justify-between items-center px-2 py-1 bg-gray-900/70 border-b border-gray-700 shrink-0 font-mono text-xs cursor-move rounded-t-lg"
			@mousedown.prevent="startDrag"
		>
			<span class="font-bold text-gray-300 uppercase tracking-wider text-[10px]">{{ windowState.name }}</span>
			<button
				@click="closeWindow"
				class="text-[10px] flex items-center justify-center hover:text-cyan-300 hover:bg-gray-700 text-gray-400 transition-colors w-4 h-4"
			>
				<X class="h-3 w-3" />
			</button>
		</div>

		<!-- Log Content -->
		<div class="flex-1 overflow-y-auto p-2 flex flex-col" ref="contentRef">
			<div class="mt-auto space-y-0.5 font-mono text-xs">
				<div v-for="(line, i) in windowState.lines" :key="i" class="whitespace-pre-wrap break-all">
					{{ line.text }}
				</div>
			</div>
		</div>

		<!-- Resize Handle -->
		<div class="absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize" @mousedown.prevent="startResize">
			<div class="w-full h-full text-gray-600 hover:text-cyan-400 transition-colors">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 11 L11 3 M7 11 L11 7" />
				</svg>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import { ref, watch, nextTick, reactive } from "vue";
import type { LogWindow as LogWindowType } from "@/composables/useLogWindows";
import { useLogWindows } from "@/composables/useLogWindows";

const props = defineProps<{
	windowState: LogWindowType;
}>();

const { close, setActive } = useLogWindows();

const position = reactive({ ...props.windowState.position });
const size = reactive({ ...props.windowState.size });

const contentRef = ref<HTMLElement | null>(null);

const closeWindow = () => {
	close(props.windowState.id);
};

const onMouseDown = () => {
	setActive(props.windowState.id);
};

watch(
	() => props.windowState.lines.length,
	async () => {
		await nextTick();
		if (contentRef.value) {
			contentRef.value.scrollTop = contentRef.value.scrollHeight;
		}
	},
);

const startDrag = (e: MouseEvent) => {
	onMouseDown();
	const startX = e.clientX;
	const startY = e.clientY;
	const startLeft = position.x;
	const startTop = position.y;

	const onMouseMove = (ev: MouseEvent) => {
		position.x = startLeft + ev.clientX - startX;
		position.y = startTop + ev.clientY - startY;
	};

	const onMouseUp = () => {
		props.windowState.position.x = position.x;
		props.windowState.position.y = position.y;
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("mouseup", onMouseUp);
	};

	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);
};

const startResize = (e: MouseEvent) => {
	onMouseDown();
	const startX = e.clientX;
	const startY = e.clientY;
	const startWidth = size.width;
	const startHeight = size.height;

	const onMouseMove = (ev: MouseEvent) => {
		size.width = Math.max(150, startWidth + ev.clientX - startX);
		size.height = Math.max(100, startHeight + ev.clientY - startY);
	};

	const onMouseUp = () => {
		props.windowState.size.width = size.width;
		props.windowState.size.height = size.height;
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("mouseup", onMouseUp);
	};

	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);
};
</script>
