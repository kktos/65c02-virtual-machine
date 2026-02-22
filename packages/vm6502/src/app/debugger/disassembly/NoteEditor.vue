<template>
	<div
		v-if="isOpen"
		class="fixed z-50 w-80 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl flex flex-col overflow-hidden"
		:style="{ top: y + 'px', left: x + 'px' }"
	>
		<div class="bg-gray-900 px-3 py-2 border-b border-gray-700 flex justify-between items-center">
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
		<div class="p-3 flex flex-col gap-2">
			<textarea
				v-model="editableText"
				ref="noteTextareaRef"
				class="w-full h-32 text-gray-200 text-xs font-mono p-2 border border-gray-700 rounded focus:border-cyan-500 focus:outline-none resize-none"
				placeholder="Enter note..."
			></textarea>
			<div class="flex justify-end items-center">
				<button
					@click="save"
					class="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded transition-colors"
				>
					Save
				</button>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ref, watch, nextTick, computed } from "vue";
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
const noteEntry = computed(() => getNoteEntry(props.address, props.scope));

watch(
	() => props.isOpen,
	(newVal) => {
		if (newVal) {
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
</script>
