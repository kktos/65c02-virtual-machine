<template>
	<div class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<DebugOptionsPopover ref="debugOptionsPopover" category="video" update-vm-globally>
			<template #default>
				<button class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0" title="Video Settings">
					<Monitor class="h-5 w-5 text-cyan-400 group-hover:text-cyan-300" />
				</button>
			</template>
			<template #extra-content>
				<div class="flex flex-col space-y-1">
					<span class="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Diagnostics</span>
					<select
						@change="runTest"
						class="w-full bg-gray-900 text-xs text-gray-300 border border-gray-600 rounded px-2 py-1 outline-none focus:border-blue-500 cursor-pointer"
					>
						<option value="" selected disabled>Run Video Test...</option>
						<option value="TEXT40">Text 40 col</option>
						<option value="TEXT80">Text 80 col</option>
						<option value="MIXED40GR">Low-Res Mixed 40cols (GR)</option>
						<option value="MIXED80GR">Low-Res Mixed 80cols (GR)</option>
						<option value="GR">Low-Res Full (GR)</option>
						<option value="MIXEDDGR">Double Low-Res Mixed (DGR)</option>
						<option value="DGR">Double Low-Res Full (DGR)</option>
						<option value="MIXED40HGR">Hi-Res Mixed 40cols (HGR)</option>
						<option value="MIXED80HGR">Hi-Res Mixed 80cols (HGR)</option>
						<option value="HGR">Hi-Res Full (HGR)</option>
					</select>
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
import { Monitor } from "lucide-vue-next";
import { computed, inject, type Ref, ref } from "vue";
import DebugOptionsPopover from "@/components/DebugOptionsPopover.vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");

const debugOptionsPopover = ref<InstanceType<typeof DebugOptionsPopover> | null>(null);

const debugOverrides = computed(() => debugOptionsPopover.value?.debugOverrides || {});

const activeMode = computed(() => {
	const mode = debugOverrides.value.videoMode;
	if (mode === "AUTO" || !mode) return "Auto";
	return String(mode);
});

const runTest = (event: Event) => {
	const select = event.target as HTMLSelectElement;
	const mode = select.value;
	if (mode && vm?.value) {
		vm.value.testVideo(mode);
		// Reset to default so we can select the same one again if needed
		select.value = "";
	}
};
</script>
