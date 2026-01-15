<template>
	<ResizablePanelGroup direction="vertical" class="h-full w-full">
		<template v-for="(viewer, index) in viewers" :key="viewer.id">
			<ResizablePanel :default-size="100 / viewers.length" :min-size="10">
				<MemoryViewer
					:id="`mem-viewer-${viewer.id}`"
					:can-close="viewers.length > 1"
					:initial-address="viewer.address"
					@split="addViewer(index, $event)"
					@close="removeViewer(index)"
				/>
			</ResizablePanel>
			<ResizableHandle v-if="index < viewers.length - 1" />
		</template>
	</ResizablePanelGroup>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ResizableHandle from '@/components/ui/resizable/ResizableHandle.vue';
import ResizablePanel from '@/components/ui/resizable/ResizablePanel.vue';
import ResizablePanelGroup from '@/components/ui/resizable/ResizablePanelGroup.vue';
import MemoryViewer from './MemoryViewer.vue';

interface Viewer {
	id: number;
	address?: number;
}

const nextId = ref(1);
const viewers = ref<Viewer[]>([{ id: 0 }]);

const addViewer = (index: number, currentAddress?: number) => {
	viewers.value.splice(index + 1, 0, {
		id: nextId.value++,
		address: currentAddress
	});
};

const removeViewer = (index: number) => {
	viewers.value.splice(index, 1);
};
</script>
