<template>
	<ScrollArea ref="scrollAreaComponentRef" class="p-2" type="always">
		<div class="flex flex-col h-full">
			<div class="mt-auto" @click="handleCommandClick">
				<div v-for="log in logs" :key="log.id" :class="getLogClass(log)">
					<div
						v-if="log.format === 'markdown'"
						class="markdown-preview"
						v-html="renderMarkdown(log.text)"
					></div>
					<div v-else class="whitespace-pre-wrap break-words">{{ log.text || "\u00A0" }}</div>
				</div>
			</div>
		</div>
	</ScrollArea>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick, type Ref } from "vue";
import type { LogEntry } from "@/types/scrollback";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { ScrollArea } from "@/components/ui/scroll-area";

const props = defineProps<{
	logs: readonly LogEntry[];
}>();

const emit = defineEmits<{
	(e: "onLink", command: string): void;
}>();

const scrollContainer = ref<HTMLElement | null>(null);
const isScrolledToBottom = ref(true);
const scrollAreaComponentRef = ref<{
	viewport: Ref<HTMLElement | undefined>;
	scrollToBottom: () => void;
} | null>(null);

const getLogClass = (log: LogEntry) => {
	return {
		"text-gray-400": log.type === "input",
		"text-red-400": log.type === "error",
	};
};

const renderMarkdown = (markdown: string) => {
	return DOMPurify.sanitize(marked.parse(markdown) as string, {
		ALLOWED_URI_REGEXP: /^(?:command|https?):/i,
	});
};

const handleCommandClick = (event: MouseEvent) => {
	const target = event.target as HTMLElement;
	const link = target.closest("a");

	// Check if the clicked element is a link with a 'command:' href
	if (link) {
		const href = link.getAttribute("href");
		if (href && href.startsWith("command:")) {
			event.preventDefault();
			const command = href.substring(8);
			if (command) emit("onLink", command);
		}
	}
};

const handleScroll = () => {
	const el = scrollContainer.value; // This is now the viewport
	if (el) {
		isScrolledToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 1;
	}
};

onMounted(() => {
	if (scrollAreaComponentRef.value) {
		scrollContainer.value = scrollAreaComponentRef.value.viewport ?? null;
		scrollContainer.value?.addEventListener("scroll", handleScroll);
	}
});

onBeforeUnmount(() => {
	scrollContainer.value?.removeEventListener("scroll", handleScroll);
});

watch(
	() => props.logs,
	() => {
		if (isScrolledToBottom.value) {
			nextTick(() => {
				scrollAreaComponentRef.value?.scrollToBottom();
			});
		}
	},
	{ deep: true },
);
</script>

<style scoped>
/* This is needed to force the intermediate div added by the ScrollArea's underlying library (reka-ui) to take up the full height.
Without this, the h-full on our flex container has no effect, and mt-auto doesn't work. */
:deep([data-reka-scroll-area-viewport] > div) {
	height: 100%;
}

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
	font-weight: normal;
}
.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3),
.markdown-preview :deep(h4),
.markdown-preview :deep(h5),
.markdown-preview :deep(h6) {
	font-weight: bold;
	margin-bottom: 0.6em;
	border-left: 3px solid;
	padding-left: 0.6em;
}
.markdown-preview :deep(a) {
	text-decoration: underline;
}
.markdown-preview :deep(a:hover) {
	text-decoration: none;
	background-color: white;
	color: black;
	outline: 2px solid white;
}
</style>
