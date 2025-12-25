<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl flex flex-col">
		<div class="overflow-y-auto space-y-4 text-xs">
			<div v-for="group in groupedSpecs" :key="group.name">
				<h3 class="font-bold text-gray-300 mb-2">{{ group.name }}</h3>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-2 pl-2">
					<div v-for="spec in group.specs" :key="spec.id" class="flex items-center gap-x-2">
						<div v-if="spec.type === 'led'" class="flex items-center">
							<span
							:class="['w-3 h-3 rounded-full transition-colors', busState[spec.id] ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-red-900 shadow-[0_0_6px_rgba(239,68,68,0.6)]']"
							></span>
						</div>
						<span v-else class="font-mono text-yellow-300">
							{{ busState[spec.id] }}
						</span>
						<label :for="spec.id" class="text-gray-400 select-none">{{ spec.label }}</label>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, inject, onUnmounted, type Ref, ref, shallowRef, watch } from "vue";
import type { MachineStateSpec } from "@/virtualmachine/cpu/bus.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");

const specs = ref<MachineStateSpec[]>([]);
const busState = shallowRef<Record<string, unknown>>({});

const groupedSpecs = computed(() => {
	const groups: Record<string, { name: string; specs: MachineStateSpec[] }> = {};
	for (const spec of specs.value) {
		const groupName = spec.group || "General";
		if (!groups[groupName]) {
			groups[groupName] = { name: groupName, specs: [] };
		}
		groups[groupName].specs.push(spec);
	}
	return Object.values(groups);
});

watch(() => vm?.value, async (newVm, oldVm) => {
	if (oldVm) {
		oldVm.onStateChange = undefined;
	}
	if (newVm) {
		await newVm.ready;
		if (newVm.getMachineStateSpecs) {
			specs.value = newVm.getMachineStateSpecs();
		}
		busState.value = newVm.busState;
		newVm.onStateChange = (state) => {
			busState.value = state;
		};
	}
}, { immediate: true });

onUnmounted(() => {
	if (vm?.value) vm.value.onStateChange = undefined;
});
</script>
