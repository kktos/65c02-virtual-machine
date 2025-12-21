<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl flex flex-col">
		<DebuggerPanelTitle title="Machine State" />
		<div class="overflow-y-auto space-y-4 text-xs">
			<div v-for="group in groupedSpecs" :key="group.name">
				<h3 class="font-bold text-gray-400 mb-2">{{ group.name }}</h3>
				<div class="grid grid-cols-[150px_150px] gap-x-4 gap-y-2 pl-2">
					<div v-for="spec in group.specs" :key="spec.id" class="flex items-center justify-between">
						<label :for="spec.id" class="text-gray-300 select-none">{{ spec.label }}</label>
						<div v-if="spec.type === 'led'" class="flex items-center">
							<span
								:class="['w-3 h-3 rounded-full transition-colors', busState[spec.id] ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]']"
							></span>
						</div>
						<span v-else class="font-mono text-yellow-300">
							{{ busState[spec.id] }}
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, inject, type Ref, ref, watch } from "vue";
import type { MachineStateSpec } from "@/cpu/bus.interface";
import type { VirtualMachine } from "@/virtualmachine.class";
import DebuggerPanelTitle from './DebuggerPanelTitle.vue';

const vm = inject<Ref<VirtualMachine>>("vm");

const specs = ref<MachineStateSpec[]>([]);
const busState = computed(() => vm?.value?.busState ?? {});

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

watch(() => vm?.value, async (newVm) => {
	if (newVm) {
		await newVm.ready;
		if (newVm.getMachineStateSpecs) {
			specs.value = newVm.getMachineStateSpecs();
		}
	}
}, { immediate: true });
</script>
