<template>
	<div class="flex items-center space-x-4 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<div class="flex flex-col">
			<span class="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Clock Speed</span>
			<div class="flex items-center space-x-2">
				<span class="font-mono text-base font-bold text-cyan-400 tabular-nums min-w-[5rem]">
					{{ speedMhz.toFixed(2) }} <span class="text-sm text-cyan-600">MHz</span>
				</span>
				<div v-if="isManual" class="flex items-center space-x-1">
					<input
						type="number"
						v-model.number="targetSpeed"
						@change="updateSpeed"
						class="w-20 bg-gray-700 text-gray-200 text-xs rounded border border-gray-600 focus:ring-1 focus:ring-cyan-500 outline-none px-1 py-0.5"
						step="0.1"
						min="0"
					/>
					<button @click="switchToPresets" class="text-gray-400 hover:text-cyan-400" title="Switch to presets">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
						</svg>
					</button>
				</div>
				<select
					v-else
					:value="targetSpeed"
					@change="onSelectChange"
					class="bg-gray-700 text-gray-200 text-xs rounded border border-gray-600 focus:ring-1 focus:ring-cyan-500 outline-none px-1 py-0.5"
				>
					<option v-for="speed in speeds" :key="speed.value" :value="speed.value">
						{{ speed.label }}
					</option>
					<option value="custom">Custom...</option>
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
const isManual = ref(false);

const speeds = computed(() => {
	return vm?.value?.machineConfig.speeds;
});

const updateSpeed = () => vm?.value.setSpeed(targetSpeed.value);

const onSelectChange = (event: Event) => {
	const val = (event.target as HTMLSelectElement).value;
	if (val === "custom") {
		isManual.value = true;
	} else {
		targetSpeed.value = Number(val);
		updateSpeed();
	}
};

const switchToPresets = () => {
	isManual.value = false;
	const currentIsPreset = speeds.value?.some((s) => s.value === targetSpeed.value);
	if (!currentIsPreset && speeds.value?.length) {
		targetSpeed.value = speeds.value[0].value;
		updateSpeed();
	}
};

watch(
	[targetSpeed, speeds],
	([newSpeed, newSpeeds]) => {
		if (newSpeeds && newSpeeds.length > 0) {
			const isPreset = newSpeeds.some((s) => s.value === newSpeed);
			if (!isPreset) {
				isManual.value = true;
			}
		}
	},
	{ immediate: true },
);

watch(
	() => vm?.value,
	async (newVm) => {
		if (newVm) {
			await newVm.ready;
			newVm.setSpeed(targetSpeed.value);
		}
	},
	{ immediate: true },
);

onMounted(() => {
	subscribeToUiUpdates?.(() => {
		speedMhz.value = vm?.value.getSpeed() ?? 0;
	});
});
</script>
