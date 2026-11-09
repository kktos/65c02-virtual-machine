<template>
	<Popover v-model:open="open">
		<PopoverTrigger as-child>
			<button
				class="flex items-center gap-1.5 h-8 px-2 shrink-0 rounded-md bg-gray-900 border border-gray-700 hover:border-gray-500 transition-colors"
				title="Clock Speed"
			>
				<span class="font-mono text-sm font-bold text-cyan-400 tabular-nums whitespace-nowrap">
					<span class="inline-block min-w-[5ch] text-right">{{ speedMhz.toFixed(2) }}</span>
					<span class="text-xs text-cyan-600"> MHz</span>
				</span>
				<ChevronDown class="h-3 w-3 text-gray-400" />
			</button>
		</PopoverTrigger>
		<PopoverContent align="end" class="w-52 p-2 bg-gray-800 border-gray-700 text-gray-100">
			<div class="px-1 mb-1 text-[10px] uppercase text-gray-400 font-bold tracking-wider">Clock Speed</div>
			<div class="flex flex-col">
				<button
					v-for="speed in speeds"
					:key="speed.value"
					@click="selectPreset(speed.value)"
					class="flex items-center gap-2 px-2 py-1 rounded text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-yellow-300"
				>
					<Check class="h-3.5 w-3.5" :class="targetSpeed === speed.value ? 'opacity-100' : 'opacity-0'" />
					{{ speed.label }}
				</button>
			</div>
			<label class="flex items-center gap-2 mt-1 pt-2 px-1 border-t border-gray-700 text-xs text-gray-400">
				Custom
				<input
					type="number"
					:value="targetSpeed"
					@change="onCustomChange"
					@keyup.enter="open = false"
					class="w-20 bg-gray-700 text-gray-200 text-xs rounded border border-gray-600 focus:ring-1 focus:ring-cyan-500 outline-none px-1 py-0.5"
					step="0.1"
					min="0.1"
				/>
				MHz
			</label>
		</PopoverContent>
	</Popover>
</template>

<script lang="ts" setup>
import { Check, ChevronDown } from "lucide-vue-next";
import { computed, inject, onUnmounted, type Ref, ref, watch } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEmulatorSpeed } from "@/composables/useEmulatorSpeed";
import { useMachine } from "@/composables/useMachine";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");

const open = ref(false);
const speedMhz = ref(0);
const { targetSpeed } = useEmulatorSpeed();

const speeds = computed(() => vm?.value?.machineConfig.speeds);

const updateSpeed = () => vm?.value.setSpeed(targetSpeed.value);

const selectPreset = (value: number) => {
	targetSpeed.value = value;
	open.value = false;
};

const onCustomChange = (event: Event) => {
	const input = event.target as HTMLInputElement;
	const raw = input.value.trim();
	const value = Number(raw);
	// Number("") is 0, and a speed of 0 makes the 65C02 core run unthrottled; only accept a real positive speed.
	if (raw !== "" && Number.isFinite(value) && value > 0) targetSpeed.value = value;
	// The input is one-way bound, so put a rejected entry back to the current speed.
	else input.value = String(targetSpeed.value);
};

watch(
	[targetSpeed, speeds],
	([, newSpeeds]) => {
		if (newSpeeds && newSpeeds.length > 0) updateSpeed();
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

const stopSpeedUpdates = useMachine().onUiFrame(() => {
	speedMhz.value = vm?.value.getSpeed() ?? 0;
});
onUnmounted(stopSpeedUpdates);
</script>
