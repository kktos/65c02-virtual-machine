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
		<ScrollbackView :logs="lines" class="h-full" />
	</FloatingWindow>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import type { LogWindow as LogWindowType } from "@/composables/useLogWindows";
import { useLogWindows } from "@/composables/useLogWindows";
import FloatingWindow from "@/components/FloatingWindow.vue";
import ScrollbackView from "./ScrollbackView.vue";

const props = defineProps<{
	windowState: LogWindowType;
}>();

const { close, setActive, getLines } = useLogWindows();
const windowRef = ref<InstanceType<typeof FloatingWindow> | null>(null);

const lines = computed(() => getLines(props.windowState.id));

const closeWindow = () => {
	close(props.windowState.id);
};

const onMouseDown = () => {
	setActive(props.windowState.id);
};

watch(
	() => props.windowState.isVisible,
	(isVisible) => {
		if (isVisible) windowRef.value?.open();
		else windowRef.value?.close();
	},
);

onMounted(() => {
	if (props.windowState.isVisible) windowRef.value?.open();
});
</script>
