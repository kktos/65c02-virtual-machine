<template>
	<div class="h-full w-full flex flex-col" :id="id">
		<Tabs v-if="displayMode === 'tabs'" v-model="activeTab" class="flex-1 min-h-0 gap-0">
			<!-- Tab strip flush with the panel, same frame as the debugger toolbar -->
			<div class="flex items-center gap-1 p-1 bg-gray-800 border-b border-gray-700 shrink-0">
				<TabsList class="h-7 p-0 gap-0.5 bg-transparent">
					<TabsTrigger value="tab1" :class="triggerClass">
						<slot name="tab1-title"></slot>
					</TabsTrigger>
					<TabsTrigger value="tab2" :class="triggerClass">
						<slot name="tab2-title"></slot>
					</TabsTrigger>
				</TabsList>
				<button @click="toggleMode" :class="toggleClass" title="Show both views side by side">Split</button>
			</div>
			<TabsContent value="tab1" class="min-h-0">
				<slot name="tab1-content"></slot>
			</TabsContent>
			<TabsContent value="tab2" class="min-h-0">
				<slot name="tab2-content"></slot>
			</TabsContent>
		</Tabs>

		<template v-else>
			<div class="flex items-center gap-1 p-1 bg-gray-800 border-b border-gray-700 shrink-0">
				<button @click="toggleMode" :class="toggleClass" title="Show one view at a time, as tabs">Tabs</button>
			</div>
			<ResizablePanelGroup direction="horizontal" :auto-save-id="id" class="flex-1 min-h-0">
				<ResizablePanel>
					<slot name="tab1-content"></slot>
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel>
					<slot name="tab2-content"></slot>
				</ResizablePanel>
			</ResizablePanelGroup>
		</template>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ResizableHandle from "./ui/resizable/ResizableHandle.vue";
import ResizablePanel from "./ui/resizable/ResizablePanel.vue";
import ResizablePanelGroup from "./ui/resizable/ResizablePanelGroup.vue";

const props = defineProps<{ id: string }>();
/** Visible tab in tabs mode, so it can also be switched from code */
const activeTab = defineModel<"tab1" | "tab2">("activeTab", { default: "tab1" });

const triggerClass =
	"flex-none h-full px-2.5 py-0 text-xs text-gray-400 hover:text-gray-200 data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300";
const toggleClass = "ml-auto h-7 px-2 text-xs rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors";

const displayMode = ref<"tabs" | "split">("tabs");

const MODE_STORAGE_KEY = `togglable-display-mode-${props.id}`;

const toggleMode = () => {
	displayMode.value = displayMode.value === "tabs" ? "split" : "tabs";
	localStorage.setItem(MODE_STORAGE_KEY, displayMode.value);
};

onMounted(() => {
	const savedMode = localStorage.getItem(MODE_STORAGE_KEY) as "tabs" | "split";
	if (savedMode) displayMode.value = savedMode;
});
</script>
