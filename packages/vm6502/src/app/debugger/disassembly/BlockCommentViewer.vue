<template>
	<div
		ref="containerRef"
		class="bg-gray-800/60 border-l-2 border-yellow-500/40 p-2 rounded-r text-gray-300 shadow-sm my-0.5 group cursor-pointer"
		@dblclick="startEdit"
	>
		<div v-if="!isEditing" class="whitespace-pre-wrap relative">
			{{ comment.text }}
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
			class="w-full bg-black text-yellow-100 font-mono text-xs focus:outline-none rounded resize-y bg-transparent"
			:style="{ 'min-height': comment.text.split('\n').length + 'rem' }"
			@keydown.esc="cancelEdit"
		></textarea>
	</div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import { useComments } from "@/composables/useComments";
import type { DisassemblyComment, DisassemblyLine } from "@/types/disassemblyline.interface";

const props = defineProps<{
	line: DisassemblyLine;
}>();

const { updateComment } = useComments();

const isEditing = ref(false);
const editText = ref("");
const containerRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const comment = ref<DisassemblyComment>({ text: "", source: "user", kind: "block" });

watch(
	() => props.line.comments,
	(comments) => {
		const list = comments.filter((c) => c.source === "user" && c.kind === "block");
		comment.value = list[0] || { text: "", source: "user", kind: "block" };
	},
);

const startEdit = () => {
	editText.value = comment.value.text;
	isEditing.value = true;
	nextTick(() => inputRef.value?.focus());
};

const cancelEdit = () => {
	isEditing.value = false;
};

onClickOutside(containerRef, () => {
	if (isEditing.value) {
		const newComment = { ...comment.value, text: editText.value };
		updateComment(props.line.addr, newComment);
		comment.value = newComment;
		isEditing.value = false;
	}
});
</script>
