<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col">
		<div class="flex justify-between items-center mb-3 border-b border-gray-700/50 pb-2 shrink-0">
			<h2 class="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
				Execution Trace
			</h2>
			<div class="flex space-x-2">
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
			<table class="text-left border-collapse">
				<thead>
					<tr class="text-gray-500 border-b border-gray-700">
						<th class="py-1 w-15">Source</th>
						<th class="py-1 w-15">Type</th>
						<th class="py-1">Target</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="(entry, index) in traceHistory" :key="index" class="hover:bg-gray-800 text-gray-300">
						<td class="py-0.5 text-yellow-500">{{ formatAddress(entry.source) }}</td>
						<td class="py-0.5 text-gray-400">{{ entry.type }}</td>
						<td class="py-0.5 text-cyan-400">{{ formatAddress(entry.target) }}</td>
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
import { inject, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import type { VirtualMachine } from "@/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const traceHistory = ref<{ type: string; source: number; target: number }[]>([]);

const formatAddress = (addr: number) => {
	return `$${addr.toString(16).toUpperCase().padStart(4, '0')}`;
};

const refreshTrace = () => vm?.value?.getTrace();

const clearTrace = () => {
	vm?.value?.clearTrace();
	traceHistory.value = [];
};

watch(() => vm?.value, (newVm) => {
	if (newVm) {
		newVm.onTraceReceived = (history) => {
			traceHistory.value = [...history].reverse();
		};
		newVm.getTrace();
	}
}, { immediate: true });

let intervalId: number;
onMounted(() => {intervalId = window.setInterval(() => vm?.value && refreshTrace(), 1000)});
onUnmounted(() => { clearInterval(intervalId); if (vm?.value) vm.value.onTraceReceived = undefined; });
</script>
