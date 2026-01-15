<template>
	<div class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<DebugOptionsPopover ref="debugOptionsPopover" category="video" update-vm-globally>
			<template #default>
				<button class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0" title="Video Settings">
					<Monitor class="h-5 w-5 text-cyan-400 group-hover:text-cyan-300" />
				</button>
			</template>
		</DebugOptionsPopover>
		<div class="flex flex-col overflow-hidden min-w-[4rem]">
			<span class="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Video</span>
			<div class="text-xs font-mono truncate text-gray-300">
				{{ activeMode }}
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { Monitor } from "lucide-vue-next";
import { computed, ref } from "vue";
import DebugOptionsPopover from "@/components/DebugOptionsPopover.vue";

const debugOptionsPopover = ref<InstanceType<typeof DebugOptionsPopover> | null>(null);

const debugOverrides = computed(() => debugOptionsPopover.value?.debugOverrides || {});

const activeMode = computed(() => {
	const mode = debugOverrides.value.videoMode;
	if (mode === "AUTO" || !mode) return "Auto";
	return String(mode);
});
</script>
