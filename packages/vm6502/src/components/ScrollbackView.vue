<template>
	<div ref="scrollContainer" class="flex flex-col p-2 overflow-y-auto" @scroll="handleScroll">
		<div class="mt-auto">
			<div v-for="log in logs" :key="log.id" :class="getLogClass(log)">
				<div v-if="log.format === 'markdown'" class="markdown-preview" v-html="renderMarkdown(log.text)"></div>
				<div v-else class="whitespace-pre-wrap break-words">{{ log.text }}</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { LogEntry } from "@/types/scrollback";
import { marked } from "marked";
import DOMPurify from "dompurify";

const props = defineProps<{
	logs: LogEntry[];
}>();

const scrollContainer = ref<HTMLElement | null>(null);
const isScrolledToBottom = ref(true);

const getLogClass = (log: LogEntry) => {
	return {
		"text-gray-400": log.type === "input",
		"text-red-400": log.type === "error",
	};
};

const renderMarkdown = (markdown: string) => {
	return DOMPurify.sanitize(marked.parse(markdown) as string);
};

const handleScroll = () => {
	const el = scrollContainer.value;
	if (el) {
		isScrolledToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 1;
	}
};

watch(
	() => props.logs,
	() => {
		if (isScrolledToBottom.value) {
			nextTick(() => {
				scrollContainer.value?.scrollTo({ top: scrollContainer.value.scrollHeight, behavior: "auto" });
			});
		}
	},
	{ deep: true },
);
</script>

<style scoped>
.markdown-preview {
	white-space: normal;
}
.markdown-preview :deep(p) {
	margin-bottom: 0.8em;
}
.markdown-preview :deep(ul) {
	list-style-type: disc;
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
.markdown-preview :deep(strong) {
	font-weight: bold;
	color: #e5e7eb;
}
.markdown-preview :deep(table) {
	border-collapse: collapse;
	margin-bottom: 0.8em;
	/* font-family: monospace; */
}
.markdown-preview :deep(th),
.markdown-preview :deep(td) {
	border: 1px solid #374151;
	padding: 0.5em 0.8em;
	text-align: left;
}
.markdown-preview :deep(th) {
	background-color: #1f2937;
	font-weight: bold;
	color: #d1d5db;
}
</style>
