<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col">
		<div class="flex justify-end items-center mb-3 border-b border-gray-700/50 pb-2 shrink-0 pt-1">
			<DebuggerPanelTitle title="Breakpoints" />
			<button
				@click="handleAddBreakpoint"
				class="text-xs px-2 py-1 rounded-full bg-cyan-600 text-white hover:bg-cyan-500 transition duration-150 shadow-md"
			>
				+ Add BP (Mock)
			</button>
		</div>
		<ul class="flex-grow min-h-0 space-y-2 overflow-y-auto text-sm text-gray-300 p-2 bg-gray-900 rounded-md">
			<li v-if="breakpoints.length === 0" class="text-gray-500 italic p-2">No active breakpoints.</li>
			<li
				v-for="(bp, index) in breakpoints"
				:key="bp.address + bp.type + index"
				:class="['flex justify-between items-center p-2 bg-gray-700 rounded-md hover:bg-gray-600 transition duration-100 font-mono border-l-4', getTypeStyles(bp.type).border]"
			>
				<div class="flex items-center space-x-3">
					<span :class="['px-2 py-0.5 text-xs font-semibold rounded-full min-w-[70px] text-center text-white', getTypeStyles(bp.type).bg]">
						{{ bp.type }}
					</span>
					<span class="text-indigo-300">{{ '$' + bp.address.toString(16).toUpperCase().padStart(4, '0') }}</span>
				</div>
				<button
					@click="onRemoveBreakpoint(bp)"
					class="text-red-400 hover:text-red-300 text-lg p-1"
					title="Remove Breakpoint"
				>
					&times;
				</button>
			</li>
		</ul>
	</div>
</template>

<script lang="ts" setup>
import type { Breakpoint } from "@/types/breakpoint.interface";
import DebuggerPanelTitle from './DebuggerPanelTitle.vue';

	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

	interface Props {
		breakpoints: Breakpoint[];
		onAddBreakpoint:  (bp: Breakpoint) => void;
		onRemoveBreakpoint:  (bp: Breakpoint) => void;
	}

	const { breakpoints, onAddBreakpoint, onRemoveBreakpoint } = defineProps<Props>();

	const handleAddBreakpoint = () => {
		console.log("Simulating adding a new memory access breakpoint at $0700.");
		const newBp: Breakpoint = { address: 0x0700, type: 'access' };
		onAddBreakpoint(newBp);
	};

	const getTypeStyles = (type: Breakpoint['type']) => {
		switch (type) {
			case 'pc': return { bg: 'bg-indigo-600', border: 'border-indigo-400' };
			case 'write': return { bg: 'bg-red-600', border: 'border-red-400' };
			case 'read': return { bg: 'bg-yellow-600', border: 'border-yellow-400' };
			case 'access': return { bg: 'bg-green-600', border: 'border-green-400' };
			default: return { bg: 'bg-gray-600', border: 'border-gray-500' };
		}
	};
</script>
