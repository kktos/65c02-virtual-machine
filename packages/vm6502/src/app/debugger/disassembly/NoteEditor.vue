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
			<div class="text-xs font-bold text-gray-300 flex items-center gap-2">
				<StickyNote class="w-4 h-4" /> Note for {{ label ? label + " @ " : "" }}${{
					address.toString(16).toUpperCase().padStart(4, "0")
				}}
				[{{ scope }}]
			</div>
			<button @click="close" class="text-gray-500 hover:text-gray-300">
				<span class="sr-only">Close</span>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Mode Toggles -->
		<div class="flex border-b border-gray-700 bg-gray-900/50 shrink-0">
			<button
				class="px-4 py-1 text-xs font-medium transition-colors focus:outline-none"
				:class="!isPreview ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-gray-200'"
				@click="isPreview = false"
			>
				Write
			</button>
			<button
				class="px-4 py-1 text-xs font-medium transition-colors focus:outline-none"
				:class="isPreview ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-gray-200'"
				@click="isPreview = true"
			>
				Preview
			</button>
		</div>

		<div class="p-3 flex flex-col gap-2 flex-grow min-h-0">
			<textarea
				v-show="!isPreview"
				v-model="editableText"
				ref="noteTextareaRef"
				class="w-full flex-grow text-gray-200 text-xs font-mono p-2 border border-gray-700 rounded focus:border-cyan-500 focus:outline-none resize-none bg-gray-900/50"
				placeholder="Enter note..."
			></textarea>
			<div
				v-show="isPreview"
				class="w-full flex-grow text-gray-200 text-xs p-2 border border-transparent overflow-y-auto markdown-preview"
				v-html="renderedMarkdown"
			></div>
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
import { marked } from "marked";
import { useSymbols } from "@/composables/useSymbols";
import { StickyNote } from "lucide-vue-next";
const { addNote, updateNote, removeNote, getNoteEntry } = useNotes();
const { getLabelForAddress } = useSymbols();

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

const label = computed(() => getLabelForAddress(props.address, props.scope));
const noteTextareaRef = ref<HTMLTextAreaElement | null>(null);
const editableText = ref("");
const isPreview = ref(false);

const position = reactive({ x: 0, y: 0 });
const size = reactive({ width: 320, height: 250 });
const dragOffset = reactive({ x: 0, y: 0 });

const noteEntry = computed(() => getNoteEntry(props.address, props.scope));

const renderedMarkdown = computed(() => {
	return marked.parse(editableText.value) as string;
});

watch(
	() => props.isOpen,
	(newVal) => {
		if (newVal) {
			// When opened, reset to initial position from props
			position.x = props.x;
			// Prevent going off-screen bottom
			position.y = Math.min(props.y, window.innerHeight - size.height - 20);

			editableText.value = noteEntry.value?.note ?? "";
			isPreview.value = false; // Reset to write mode on open
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

<style scoped>
.markdown-preview :deep(h1) {
	font-size: 1.5em;
	font-weight: bold;
	margin-bottom: 0.5em;
	color: #e5e7eb;
}
.markdown-preview :deep(h2) {
	font-size: 1.3em;
	font-weight: bold;
	margin-bottom: 0.5em;
	color: #e5e7eb;
}
.markdown-preview :deep(h3) {
	font-size: 1.1em;
	font-weight: bold;
	margin-bottom: 0.5em;
}
.markdown-preview :deep(p) {
	margin-bottom: 0.8em;
}
.markdown-preview :deep(ul) {
	list-style-type: disc;
	padding-left: 1.5em;
	margin-bottom: 0.8em;
}
.markdown-preview :deep(ol) {
	list-style-type: decimal;
	padding-left: 1.5em;
	margin-bottom: 0.8em;
}
.markdown-preview :deep(code) {
	background-color: #374151;
	padding: 0.1em 0.3em;
	border-radius: 0.2em;
	font-family: monospace;
}
.markdown-preview :deep(pre) {
	background-color: #111827;
	padding: 0.5em;
	border-radius: 0.3em;
	overflow-x: auto;
	margin-bottom: 0.8em;
	border: 1px solid #374151;
}
.markdown-preview :deep(blockquote) {
	border-left: 3px solid #4b5563;
	padding-left: 0.8em;
	color: #9ca3af;
	margin-bottom: 0.8em;
}
.markdown-preview :deep(a) {
	color: #22d3ee;
	text-decoration: underline;
}
</style>
