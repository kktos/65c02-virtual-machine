<template>
	<div class="p-1 bg-gray-800 rounded-lg shadow-xl flex flex-col h-full overflow-hidden">
		<div class="overflow-y-auto pr-2">
			<div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1 text-xs">
				<div
					v-for="group in groupedSpecs"
					:key="group.name"
					class="bg-gray-900/50 p-3 rounded border border-gray-700/50"
				>
					<h3 class="font-bold text-gray-300 mb-1 text-[0.65rem] uppercase pb-1">
						{{ group.name }}
					</h3>
					<div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-center">
						<template v-for="(spec, index) in group.specs" :key="index">
							<div v-if="Array.isArray(spec)" class="col-span-2 flex items-center gap-4">
								<div v-for="subSpec in spec" :key="subSpec.id" class="flex items-center gap-3">
									<div v-if="subSpec.type === 'led'" class="flex items-center">
										<span
											:class="[
												'w-3 h-3 rounded-full transition-colors',
												busState[subSpec.id]
													? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
													: 'bg-red-900 shadow-[0_0_6px_rgba(239,68,68,0.6)]',
											]"
										></span>
									</div>
									<span v-else class="font-mono text-yellow-300">
										{{ busState[subSpec.id] }}
									</span>
									<label :for="subSpec.id" class="text-gray-400 select-none truncate">
										{{ subSpec.label }}
									</label>
								</div>
							</div>
							<template v-else>
								<div class="flex justify-center min-w-[1rem]">
									<div v-if="spec.type === 'led'" class="flex items-center">
										<span
											:class="[
												'w-3 h-3 rounded-full transition-colors',
												busState[spec.id]
													? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
													: 'bg-red-900 shadow-[0_0_6px_rgba(239,68,68,0.6)]',
											]"
										></span>
									</div>
									<span v-else class="font-mono text-yellow-300">
										{{ busState[spec.id] }}
									</span>
								</div>
								<label :for="spec.id" class="text-gray-400 select-none truncate">
									{{ spec.label }}
								</label>
							</template>
						</template>
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

const specs = ref<(MachineStateSpec | [MachineStateSpec, MachineStateSpec])[]>([]);
const busState = shallowRef<Record<string, unknown>>({});

const groupedSpecs = computed(() => {
	const groups: Record<string, { name: string; specs: (MachineStateSpec | [MachineStateSpec, MachineStateSpec])[] }> =
		{};
	for (const spec of specs.value) {
		const groupName = Array.isArray(spec) ? (spec[0].group as string) : spec.group || "General";
		if (!groups[groupName]) groups[groupName] = { name: groupName, specs: [] };
		groups[groupName].specs.push(spec);
	}
	return Object.values(groups);
});

watch(
	() => vm?.value,
	async (newVm, oldVm) => {
		if (oldVm) oldVm.onStateChange = undefined;
		if (newVm) {
			await newVm.ready;
			if (newVm.getMachineStateSpecs) specs.value = newVm.getMachineStateSpecs();
			busState.value = newVm.busState;
			newVm.onStateChange = (state) => (busState.value = state);
		}
	},
	{ immediate: true },
);

onUnmounted(() => {
	if (vm?.value) vm.value.onStateChange = undefined;
});
</script>
