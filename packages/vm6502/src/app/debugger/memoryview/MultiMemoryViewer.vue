<template>
	<ResizablePanelGroup direction="vertical" class="h-full w-full" :key="viewers.length">
		<template v-for="(viewer, index) in viewers" :key="viewer.id">
			<ResizablePanel :default-size="100 / viewers.length" :min-size="10">
				<MemoryViewer
					:id="`mem-viewer-${viewer.id}`"
					:can-close="viewers.length > 1"
					:initial-address="viewer.address"
					:listen-to-nav="viewer.id === activeViewerId"
					:is-active="viewer.id === activeViewerId"
					@click="activeViewerId = viewer.id"
					@split="addViewer(index, $event)"
					@close="removeViewer(index)"
					@update:address="updateViewerAddress(index, $event)"
				/>
			</ResizablePanel>
			<ResizableHandle v-if="index < viewers.length - 1" />
		</template>
	</ResizablePanelGroup>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import ResizableHandle from "@/components/ui/resizable/ResizableHandle.vue";
import ResizablePanel from "@/components/ui/resizable/ResizablePanel.vue";
import ResizablePanelGroup from "@/components/ui/resizable/ResizablePanelGroup.vue";
import MemoryViewer from "./MemoryViewer.vue";
import { useMemView } from "@/composables/useMemView";

const { activeViewerId, viewers, loadLayout, addViewer, removeViewer, updateViewerAddress } = useMemView();

onMounted(() => loadLayout());
</script>
