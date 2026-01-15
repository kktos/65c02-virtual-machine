<template>
	<div class="relative h-full w-full" :id="id">
		<div class="absolute top-0.5 right-2 z-20">
			<button
				@click="toggleMode"
				class="px-2 py-0.5 text-xs rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
				title="Toggle between tabbed and split view"
			>
				{{ displayMode === 'tabs' ? 'Split' : 'Tabs' }}
			</button>
		</div>

		<div v-if="displayMode === 'tabs'" class="h-full">
			<Tabs default-value="tab1" class="h-full flex flex-col">
				<TabsList class="bg-gray-900/80 p-1 shrink-0">
					<TabsTrigger value="tab1" class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400">
						<slot name="tab1-title"></slot>
					</TabsTrigger>
					<TabsTrigger value="tab2" class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400">
						<slot name="tab2-title"></slot>
					</TabsTrigger>
				</TabsList>
				<TabsContent value="tab1" class="flex-grow min-h-0">
					<slot name="tab1-content"></slot>
				</TabsContent>
				<TabsContent value="tab2" class="flex-grow min-h-0">
					<slot name="tab2-content"></slot>
				</TabsContent>
			</Tabs>
		</div>

		<div v-else class="h-full pt-2">
			<ResizablePanelGroup direction="horizontal" :auto-save-id="id">
				<ResizablePanel>
					<slot name="tab1-content"></slot>
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel>
					<slot name="tab2-content"></slot>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { onMounted, ref } from 'vue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ResizableHandle from './ui/resizable/ResizableHandle.vue';
import ResizablePanel from './ui/resizable/ResizablePanel.vue';
import ResizablePanelGroup from './ui/resizable/ResizablePanelGroup.vue';

	const props = defineProps<{ id: string }>();

	const displayMode = ref<'tabs' | 'split'>('tabs');

	const MODE_STORAGE_KEY = `togglable-display-mode-${props.id}`;

	const toggleMode = () => {
		displayMode.value = displayMode.value === 'tabs' ? 'split' : 'tabs';
		localStorage.setItem(MODE_STORAGE_KEY, displayMode.value);
	};

	onMounted(() => {
		const savedMode = localStorage.getItem(MODE_STORAGE_KEY) as 'tabs' | 'split';
		if (savedMode) displayMode.value = savedMode;
	});
</script>
