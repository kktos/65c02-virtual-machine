<template>
	<div
		ref="containerRef"
		class="bg-gray-800/60 border-l-2 border-yellow-500/40 p-2 rounded-r text-gray-300 shadow-sm my-0.5 group cursor-pointer"
		@dblclick="startEdit"
	>
		<div v-if="!isEditing" class="whitespace-pre-wrap relative">
			{{ text }}
			<div
				class="absolute top-0 right-0 text-[9px] uppercase tracking-tighter text-[#4afa8a] opacity-0 group-hover:opacity-100 transition-opacity"
			>
				Double-click to edit
			</div>
		</div>
		<textarea
			v-else
			ref="inputRef"
			v-model="editText"
			class="w-full -translate-y-[3.9px] bg-black text-yellow-100 border-none -mb-2 whitespace-pre-wrap focus:outline-none rounded resize-none bg-transparent overflow-y-auto"
			:style="{ height: textAreaHeight }"
			@keydown.esc="cancelEdit"
		></textarea>
	</div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import { useComments } from "@/composables/useComments";

const {
	addr,
	text,
	wannaEdit = false,
} = defineProps<{
	addr: number;
	text: string;
	wannaEdit: boolean;
}>();

const { updateComment, editingBlockCommentAddr } = useComments();

const isEditing = ref(false);
const editText = ref(text.trim());
const containerRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);

const textAreaHeight = computed(() => {
	const lines = editText.value.split("\n").length;
	return Math.min(Math.max(lines, 1), 6) + "rem";
});

const startEdit = () => {
	editText.value = text.trim();
	isEditing.value = true;
	nextTick(() => inputRef.value?.focus());
};

const cancelEdit = () => {
	isEditing.value = false;
};

onClickOutside(containerRef, () => {
	if (isEditing.value) {
		updateComment(addr, "block", editText.value.trim() + " ");
		isEditing.value = false;
	}
});

watch(
	editingBlockCommentAddr,
	(newAddr) => {
		if (newAddr === addr) {
			startEdit();
			editingBlockCommentAddr.value = null;
		}
	},
	{ immediate: true },
);
</script>
