<template>
	<FloatingWindow
		ref="windowRef"
		:id="`log-window-${windowState.id}`"
		:title="windowState.name"
		:default-x="windowState.position.x"
		:default-y="windowState.position.y"
		:default-width="windowState.size.width"
		:default-height="windowState.size.height"
		:style="{ zIndex: windowState.zIndex }"
		@close="closeWindow"
		@mousedown="onMouseDown"
	>
		<div class="h-full flex flex-col p-2 text-green-400 font-mono text-xs" ref="contentRef">
			<div class="mt-auto space-y-0.5">
				<div v-for="(line, i) in windowState.lines" :key="i" class="whitespace-pre-wrap break-all">
					{{ line.text }}
				</div>
			</div>
		</div>
	</FloatingWindow>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from "vue";
import type { LogWindow as LogWindowType } from "@/composables/useLogWindows";
import { useLogWindows } from "@/composables/useLogWindows";
import FloatingWindow from "@/components/FloatingWindow.vue";

const props = defineProps<{
	windowState: LogWindowType;
}>();

const { close, setActive } = useLogWindows();
const windowRef = ref<InstanceType<typeof FloatingWindow> | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const closeWindow = () => {
	close(props.windowState.id);
};

const onMouseDown = () => {
	setActive(props.windowState.id);
};

const scrollToBottom = async () => {
	await nextTick();
	// Scroll the parent container provided by FloatingWindow
	if (contentRef.value && contentRef.value.parentElement) {
		contentRef.value.parentElement.scrollTop = contentRef.value.parentElement.scrollHeight;
	}
};

watch(() => props.windowState.lines.length, scrollToBottom);

watch(
	() => props.windowState.isVisible,
	(isVisible) => {
		if (isVisible) {
			windowRef.value?.open();
			scrollToBottom();
		} else {
			windowRef.value?.close();
		}
	},
);

onMounted(() => {
	if (props.windowState.isVisible) {
		windowRef.value?.open();
		scrollToBottom();
	}
});
</script>
