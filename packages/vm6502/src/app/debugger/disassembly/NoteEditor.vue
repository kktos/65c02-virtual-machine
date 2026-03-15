<template>
	<FloatingWindow
		ref="windowRef"
		id="note-editor"
		:title="windowTitle"
		:options="{
			defaultX: x,
			defaultY: y,
			defaultWidth: 320,
			defaultHeight: 250,
			contentScrollable: false,
		}"
		@close="close"
	>
		<template #icon>
			<StickyNote class="w-4 h-4" />
		</template>
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
			<div class="flex justify-end items-center shrink-0 p-1">
				<button
					@click="save"
					class="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded transition-colors"
				>
					Save
				</button>
			</div>
		</div>
	</FloatingWindow>
</template>

<script lang="ts" setup>
import { ref, watch, nextTick, computed, onMounted } from "vue";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import { useNotes } from "@/composables/useNotes";
import { marked } from "marked";
import { useSymbols } from "@/composables/useSymbols";
import { StickyNote } from "lucide-vue-next";
import FloatingWindow from "@/components/FloatingWindow.vue";

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
const windowRef = ref<InstanceType<typeof FloatingWindow> | null>(null);
const editableText = ref("");
const isPreview = ref(false);

const noteEntry = computed(() => getNoteEntry(props.address, props.scope));
const windowTitle = computed(() => {
	const addrStr = props.address.toString(16).toUpperCase().padStart(4, "0");
	const lbl = label.value ? `${label.value} @ ` : "";
	return `Note for ${lbl}$${addrStr} [${props.scope}]`;
});

const renderedMarkdown = computed(() => {
	return marked.parse(editableText.value) as string;
});

watch(
	() => props.isOpen,
	(newVal) => {
		if (newVal) {
			windowRef.value?.open();

			editableText.value = noteEntry.value?.note ?? "";
			isPreview.value = false; // Reset to write mode on open
			nextTick(() => {
				noteTextareaRef.value?.focus();
			});
		} else {
			windowRef.value?.close();
		}
	},
);

const close = () => {
	emit("update:isOpen", false);
};

onMounted(() => {
	if (props.isOpen) {
		windowRef.value?.open();
	}
});

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
