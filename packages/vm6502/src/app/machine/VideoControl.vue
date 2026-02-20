<template>
	<div class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<DebugOptionsPopover ref="debugOptionsPopover" category="video" update-vm-globally>
			<template #default>
				<button
					class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0"
					title="Video Settings"
				>
					<Monitor class="h-5 w-5 text-cyan-400 group-hover:text-cyan-300" />
				</button>
			</template>
			<template #extra-content>
				<div class="flex flex-col space-y-1 mt-2">
					<span class="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Capture</span>
					<button
						@click="saveSnapshot"
						class="flex items-center space-x-2 w-full bg-gray-900 text-xs text-gray-300 border border-gray-600 rounded px-2 py-1 hover:bg-gray-800 transition-colors"
					>
						<Camera class="w-3 h-3" />
						<span>Save Screenshot</span>
					</button>
				</div>
			</template>
		</DebugOptionsPopover>
		<div class="flex flex-col overflow-hidden min-w-[4rem]">
			<div class="flex justify-between items-baseline">
				<span class="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Video</span>
				<span class="text-xs font-mono truncate text-gray-300">{{ activeMode }}</span>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { Camera, Monitor } from "lucide-vue-next";
import { computed, ref } from "vue";
import DebugOptionsPopover from "@/components/DebugOptionsPopover.vue";

const debugOptionsPopover = ref<InstanceType<typeof DebugOptionsPopover> | null>(null);
const debugOverrides = computed(() => debugOptionsPopover.value?.debugOverrides || {});

const activeMode = computed(() => {
	const mode = debugOverrides.value.videoMode;
	if (mode === "AUTO" || !mode) return "Auto";
	return String(mode);
});

const saveSnapshot = () => {
	const canvas = document.querySelector("canvas");
	if (canvas) {
		const link = document.createElement("a");
		link.download = `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
		link.href = canvas.toDataURL("image/png");
		link.click();
	}
};
</script>
