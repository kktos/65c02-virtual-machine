<template>
	<div v-if="videoOptions.length > 0" class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<Popover>
			<PopoverTrigger as-child>
				<button class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0" title="Video Settings">
					<Monitor class="h-5 w-5 text-cyan-400 group-hover:text-cyan-300" />
				</button>
			</PopoverTrigger>
			<PopoverContent class="w-64 p-4 bg-gray-800 border-gray-700 text-gray-100" align="end">
				<div class="space-y-3">
					<div v-for="opt in videoOptions" :key="opt.id" class="flex items-center justify-between">
						<label :for="opt.id" class="text-xs text-gray-300 select-none cursor-pointer flex-grow">{{ opt.label }}</label>
						<input
							v-if="opt.type === 'boolean'"
							type="checkbox"
							:id="opt.id"
							v-model="debugOverrides[opt.id]"
							class="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500 h-4 w-4 ml-2"
						/>
						<select
							v-if="opt.type === 'select'"
							:id="opt.id"
							v-model="debugOverrides[opt.id]"
							class="bg-gray-700 text-yellow-300 font-mono text-xs rounded-md px-2 py-0.5 border border-gray-600 focus:ring-2 focus:ring-cyan-500 outline-none ml-2 max-w-[120px]"
						>
							<option v-for="option in opt.options" :key="option.value" :value="option.value">{{ option.label }}</option>
						</select>
					</div>
				</div>
			</PopoverContent>
		</Popover>
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
import { computed, inject, type Ref, ref, watch } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DebugOption } from "@/virtualmachine/cpu/bus.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const videoOptions = ref<DebugOption[]>([]);
const debugOverrides = ref<Record<string, unknown>>({});

const activeMode = computed(() => {
	const mode = debugOverrides.value.videoMode;
	if (mode === "AUTO" || !mode) return "Auto";
	return String(mode);
});

watch(() => vm?.value, async (newVm) => {
	if (newVm) {
		await newVm.ready;
		videoOptions.value = newVm.getDebugOptions().filter((opt) => opt.category === "video");

		// Initialize defaults
		const defaults: Record<string, unknown> = {};
		videoOptions.value.forEach((opt) => {
			if (opt.type === "select" && opt.options?.length) {
				defaults[opt.id] = opt.options[0]?.value;
			} else {
				defaults[opt.id] = false;
			}
		});
		debugOverrides.value = defaults;
	}
}, { immediate: true });

watch(debugOverrides, (newVal) => {
	vm?.value.setDebugOverrides(newVal);
}, { deep: true });
</script>
