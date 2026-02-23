<template>
	<div
		v-if="isOpen"
		class="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl flex flex-col"
		:style="{
			top: `${position.y}px`,
			left: `${position.x}px`,
			width: `${size.width}px`,
			height: `${size.height}px`,
		}"
		@wheel.stop
	>
		<div
			class="bg-gray-900 px-3 py-2 border-b border-gray-700 flex justify-between items-center cursor-move"
			@mousedown.prevent="handleDragStart"
		>
			<span class="text-xs font-bold text-gray-300"
				>Note for ${{ address.toString(16).toUpperCase().padStart(4, "0") }} [{{ scope }}]</span
			>
			<button @click="close" class="text-gray-500 hover:text-gray-300">
				<span class="sr-only">Close</span>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
		<div class="p-3 flex flex-col gap-2 flex-grow min-h-0">
			<textarea
				v-model="editableText"
				ref="noteTextareaRef"
				class="w-full flex-grow text-gray-200 text-xs font-mono p-2 border border-gray-700 rounded focus:border-cyan-500 focus:outline-none resize-none bg-gray-900/50"
				placeholder="Enter note..."
			></textarea>
			<div class="flex justify-end items-center shrink-0">
				<button
					@click="save"
					class="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded transition-colors"
				>
					Save
				</button>
			</div>
		</div>
		<div
			class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize text-gray-500 hover:text-gray-300"
			@mousedown.prevent="handleResizeStart"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 4.5 15 15m0 0V8.25m0 6.75H8.25" />
			</svg>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ref, watch, nextTick, computed, reactive } from "vue";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import { useNotes } from "@/composables/useNotes";

const { addNote, updateNote, removeNote, getNoteEntry } = useNotes();

const props = defineProps<{
	isOpen: boolean;
	x: number;
	y: number;
	address: number;
	scope: string;
	disassembly: DisassemblyLine[];
}>();

const emit = defineEmits<{
	(e: "update:isOpen", value: boolean): void;
}>();

const noteTextareaRef = ref<HTMLTextAreaElement | null>(null);
const editableText = ref("");

const position = reactive({ x: 0, y: 0 });
const size = reactive({ width: 320, height: 250 });
const dragOffset = reactive({ x: 0, y: 0 });

const noteEntry = computed(() => getNoteEntry(props.address, props.scope));

watch(
	() => props.isOpen,
	(newVal) => {
		if (newVal) {
			// When opened, reset to initial position from props
			position.x = props.x;
			// Prevent going off-screen bottom
			position.y = Math.min(props.y, window.innerHeight - size.height - 20);

			editableText.value = noteEntry.value?.note ?? "";
			nextTick(() => {
				noteTextareaRef.value?.focus();
			});
		}
	},
);

const close = () => emit("update:isOpen", false);

const save = async () => {
	const text = editableText.value.trim();
	if (!text.trim()) {
		if (noteEntry.value) await removeNote(noteEntry.value.id!);
	} else {
		if (noteEntry.value) await updateNote(noteEntry.value.id!, text);
		else await addNote(props.address, props.scope, text);
	}
	close();
};

// --- Dragging Logic ---
const handleDragStart = (event: MouseEvent) => {
	dragOffset.x = event.clientX - position.x;
	dragOffset.y = event.clientY - position.y;
	document.body.style.cursor = "move";

	const handleDragMove = (moveEvent: MouseEvent) => {
		position.x = moveEvent.clientX - dragOffset.x;
		position.y = moveEvent.clientY - dragOffset.y;
	};

	const handleDragEnd = () => {
		document.body.style.cursor = "";
		window.removeEventListener("mousemove", handleDragMove);
		window.removeEventListener("mouseup", handleDragEnd);
	};

	window.addEventListener("mousemove", handleDragMove);
	window.addEventListener("mouseup", handleDragEnd);
};

// --- Resizing Logic ---
const handleResizeStart = (event: MouseEvent) => {
	event.stopPropagation(); // prevent starting a drag
	const initialMouseX = event.clientX;
	const initialMouseY = event.clientY;
	const initialWidth = size.width;
	const initialHeight = size.height;
	document.body.style.cursor = "se-resize";

	const handleResizeMove = (moveEvent: MouseEvent) => {
		const dx = moveEvent.clientX - initialMouseX;
		const dy = moveEvent.clientY - initialMouseY;
		size.width = Math.max(240, initialWidth + dx); // min width
		size.height = Math.max(150, initialHeight + dy); // min height
	};

	const handleResizeEnd = () => {
		document.body.style.cursor = "";
		window.removeEventListener("mousemove", handleResizeMove);
		window.removeEventListener("mouseup", handleResizeEnd);
	};

	window.addEventListener("mousemove", handleResizeMove);
	window.addEventListener("mouseup", handleResizeEnd);
};
</script>
