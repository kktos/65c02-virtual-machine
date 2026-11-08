<template>
	<div class="flex items-center">
		<DebugOptionsPopover ref="debugOptionsPopover" category="video" update-vm-globally>
			<template #default>
				<button class="toolbar-btn group" :title="`Video Settings (mode: ${activeMode})`">
					<Monitor class="h-4 w-4 text-cyan-400 group-hover:text-cyan-300" />
				</button>
			</template>
			<template #extra-content>
				<div class="flex flex-col space-y-1 mt-2">
					<span class="text-[10px] uppercase text-cyan-400 font-bold tracking-wider">Capture</span>
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
		<span class="hidden @[48rem]:block max-w-[5rem] pl-0.5 pr-1.5 text-xs font-mono truncate text-gray-300">
			{{ activeMode }}
		</span>
	</div>
</template>

<script lang="ts" setup>
import { Camera, Monitor } from "lucide-vue-next";
import { computed, ref } from "vue";
import DebugOptionsPopover from "@/components/DebugOptionsPopover.vue";
import { useMachine } from "@/composables/useMachine";
import { bytesToBase64 } from "@/lib/png.lib";

const debugOptionsPopover = ref<InstanceType<typeof DebugOptionsPopover> | null>(null);
const debugOverrides = computed(() => debugOptionsPopover.value?.debugOverrides || {});

const activeMode = computed(() => {
	const mode = debugOverrides.value.videoMode;
	if (mode === "AUTO" || !mode) return "Auto";
	return String(mode);
});

const { vm } = useMachine();

// The same capture as the MCP `screenshot` tool: the emulator's frame at its resolution, not the canvas
const saveSnapshot = async () => {
	const shot = await vm.value?.screenshot();
	if (!shot) return;
	const link = document.createElement("a");
	link.download = `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
	link.href = `data:image/png;base64,${bytesToBase64(shot.png)}`;
	link.click();
};
</script>
