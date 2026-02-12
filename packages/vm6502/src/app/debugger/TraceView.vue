<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col">
		<div class="flex justify-between items-center mb-3 border-b border-gray-700/50 pb-2 shrink-0">
			<h2 class="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
				Execution Trace
			</h2>
			<div class="flex space-x-2">
				<Popover>
					<PopoverTrigger as-child>
						<button class="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors" title="Trace Settings">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
							</svg>
						</button>
					</PopoverTrigger>
					<PopoverContent class="w-60 bg-gray-800 border-gray-700 text-gray-100 p-3" align="end">
						<div class="flex flex-col space-y-2">
							<label class="text-xs font-medium text-gray-400">Max Trace Depth</label>
							<input type="number" v-model.number="traceSize" class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500" min="10" max="1000" step="10" />
						</div>
					</PopoverContent>
				</Popover>

				<button
					@click="refreshTrace"
					class="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
					title="Refresh Trace"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
					</svg>
				</button>
				<button
					@click="clearTrace"
					class="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
					title="Clear Trace"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>
		</div>

		<div class="flex-grow overflow-y-auto font-mono text-xs bg-gray-900 p-2 rounded-md">
			<table class="text-left border-collapse w-full">
				<thead class="sticky top-0 bg-gray-900">
					<tr class="text-gray-500 border-b border-gray-700">
						<th class="py-1 w-12">Source</th>
						<th class="py-1 w-15 text-center">Type</th>
						<th class="py-1">Target</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="(entry, index) in traceHistory" :key="index" class="hover:bg-gray-800 text-gray-300">
						<td
							class="py-0.5 text-yellow-500 cursor-pointer hover:text-yellow-300 hover:underline"
							@click="handleJumpToSource(entry.source)"
							title="Jump to disassembly"
						>
							{{ formatAddress(entry.source) }}
						</td>
						<td class="py-0.5 text-gray-400 text-center">{{ entry.type }}</td>
						<td
							class="py-0.5 text-cyan-400 cursor-pointer hover:text-yellow-300 hover:underline"
							@click="handleJumpToSource(entry.target)"
							title="Jump to disassembly"
						>
							{{ formatAddress(entry.target) }}
						</td>
					</tr>
					<tr v-if="traceHistory.length === 0">
						<td colspan="3" class="py-4 text-center text-gray-600 italic">
							No trace data. Enable tracing in controls.
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { inject, onUnmounted, type Ref, ref, watch } from "vue";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { useDisassembly } from "@/composables/useDisassembly";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const { requestJump } = useDisassembly();
const traceHistory = ref<{ type: string; source: number; target: number }[]>([]);
const traceSize = ref(200);

const formatAddress = (addr: number) => {
	const bank= addr >> 16;
	const address= addr & 0xFFFF;
	return `$${bank.toString(16).toUpperCase().padStart(2, '0')}:${address.toString(16).toUpperCase().padStart(4, '0')}`;
};

const refreshTrace = () => vm?.value?.getTrace();

const clearTrace = () => {
	vm?.value?.clearTrace();
	traceHistory.value = [];
};

const handleJumpToSource = (addr: number) => requestJump(addr);

watch(() => vm?.value, (newVm) => {
	if (newVm) {
		newVm.onTraceReceived = (history) => {
			traceHistory.value = [...history].reverse();
		};
		newVm.setTraceSize(traceSize.value);
		newVm.getTrace();
	}
}, { immediate: true });

watch(traceSize, (newSize) => {
	vm?.value?.setTraceSize(newSize);
});

onUnmounted(() => { if (vm?.value) vm.value.onTraceReceived = undefined; });
</script>
