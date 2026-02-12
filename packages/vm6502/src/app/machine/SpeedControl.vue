<template>
	<div class="flex items-center space-x-4 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<div class="flex flex-col">
			<span class="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Clock Speed</span>
			<div class="flex items-center space-x-2">
				<span class="font-mono text-base font-bold text-cyan-400 tabular-nums min-w-[5rem]">
					{{ speedMhz.toFixed(2) }} <span class="text-sm text-cyan-600">MHz</span>
				</span>
				<select
					v-model="targetSpeed"
					@change="updateSpeed"
					class="bg-gray-700 text-gray-200 text-xs rounded border border-gray-600 focus:ring-1 focus:ring-cyan-500 outline-none px-1 py-0.5"
				>
					<option v-for="speed in speeds" :key="speed.value" :value="speed.value">
						{{ speed.label }}
					</option>
				</select>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, type Ref, ref, watch } from "vue";
import { useEmulatorSpeed } from "@/composables/useEmulatorSpeed";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const subscribeToUiUpdates = inject<(callback: () => void) => void>("subscribeToUiUpdates");

const speedMhz = ref(0);
const { targetSpeed } = useEmulatorSpeed();

const speeds = computed(() => {
	return vm?.value?.machineConfig.speeds;
});

const updateSpeed = () => vm?.value.setSpeed(targetSpeed.value);

watch(() => vm?.value, async (newVm) => {
	if (newVm) {
		await newVm.ready;
		newVm.setSpeed(targetSpeed.value);
	}
}, { immediate: true });

onMounted(() => {
	subscribeToUiUpdates?.(() => {speedMhz.value = vm?.value.getSpeed() ?? 0});
});
</script>
