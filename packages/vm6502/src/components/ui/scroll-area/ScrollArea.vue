<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { ScrollAreaRootProps } from "reka-ui";
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { useTemplateRef } from "vue";
import { cn } from "@/lib/utils";
import ScrollBar from "./ScrollBar.vue";

const props = defineProps<ScrollAreaRootProps & { class?: HTMLAttributes["class"] }>();
const delegatedProps = reactiveOmit(props, "class");
const scrollArea = useTemplateRef("scrollArea");
const scrollToBottom = () => {
	const viewport = scrollArea.value?.viewport;
	if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
};

defineExpose({ scrollToBottom, viewport: scrollArea.value?.viewport });
</script>

<template>
	<ScrollAreaRoot
		ref="scrollArea"
		data-slot="scroll-area"
		v-bind="delegatedProps"
		:class="cn('relative', props.class)"
	>
		<ScrollAreaViewport
			data-slot="scroll-area-viewport"
			class="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
		>
			<slot />
		</ScrollAreaViewport>
		<ScrollBar />
		<ScrollAreaCorner />
	</ScrollAreaRoot>
</template>
