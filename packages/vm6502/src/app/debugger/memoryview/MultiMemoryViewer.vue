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
import { onMounted, ref } from 'vue';
import ResizableHandle from '@/components/ui/resizable/ResizableHandle.vue';
import ResizablePanel from '@/components/ui/resizable/ResizablePanel.vue';
import ResizablePanelGroup from '@/components/ui/resizable/ResizablePanelGroup.vue';
import MemoryViewer from './MemoryViewer.vue';

interface Viewer {
	id: number;
	address?: number;
}

const STORAGE_KEY = 'memory-viewers-layout';
const nextId = ref(1);
const viewers = ref<Viewer[]>([{ id: 0 }]);
const activeViewerId = ref(0);

const saveLayout = () => {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(viewers.value));
};

const updateViewerAddress = (index: number, address: number) => {
	if (viewers.value[index]) {
		viewers.value[index].address = address;
		saveLayout();
	}
};

const addViewer = (index: number, currentAddress?: number) => {
	viewers.value.splice(index + 1, 0, {
		id: nextId.value++,
		address: currentAddress
	});
	saveLayout();
};

const removeViewer = (index: number) => {
	const removedId = viewers.value[index]?.id;
	viewers.value.splice(index, 1);
	if (removedId === activeViewerId.value) {
		activeViewerId.value = viewers.value[0]?.id ?? 0;
	}
	saveLayout();
};

onMounted(() => {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved) {
		try {
			const parsed = JSON.parse(saved);
			if (Array.isArray(parsed) && parsed.length > 0) {
				viewers.value = parsed;
				const maxId = parsed.reduce((max, v) => Math.max(max, v.id), 0);
				nextId.value = maxId + 1;
				if (!viewers.value.some((v) => v.id === activeViewerId.value)) {
					activeViewerId.value = viewers.value[0]?.id ?? 0;
				}
			}
		} catch (e) {
			console.error('Failed to load memory viewers layout', e);
		}
	}
});
</script>
