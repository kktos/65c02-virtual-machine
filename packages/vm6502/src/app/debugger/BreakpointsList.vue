<template>
	<div class="flex flex-col h-full gap-2">
		<BreakpointAddControl />
		<ScrollArea class="flex-grow w-full">
			<ul class="flex-grow min-h-0 space-y-2 overflow-y-auto text-sm text-gray-300 p-2 bg-gray-900 rounded-md h-full">
			<li v-if="breakpoints.length === 0" class="text-gray-500 italic p-2">No active breakpoints.</li>
			<li
				v-for="(bp, index) in breakpoints"
				:key="bp.address + bp.type + index"
				:class="['flex justify-between items-center p-2 bg-gray-700 rounded-md hover:bg-gray-600 transition duration-100 font-mono border-l-4', getTypeStyles(bp.type).border]"
			>
				<div class="flex items-center space-x-3">
					<input
						type="checkbox"
						:checked="bp.enabled"
						@change="handleToggleEnable(bp)"
						class="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out bg-gray-600 border-gray-500 rounded focus:ring-offset-gray-800 cursor-pointer"
						title="Enable/Disable Breakpoint"
					/>
					<span :class="['px-2 py-0.5 text-xs font-semibold rounded-full min-w-[70px] text-center text-white', getTypeStyles(bp.type).bg, !bp.enabled ? 'opacity-50' : '']">
						{{ bp.type }}
					</span>
					<span :class="['text-indigo-300', !bp.enabled ? 'opacity-50' : '']">
						{{ '$' + bp.address.toString(16).toUpperCase().padStart(4, '0') }}
						<span v-if="bp.endAddress && bp.endAddress !== bp.address">
							- {{ '$' + bp.endAddress.toString(16).toUpperCase().padStart(4, '0') }}
						</span>
					</span>
				</div>
				<button
					@click="handleRemoveBreakpoint(bp)"
					class="text-red-400 hover:text-red-300 text-lg p-1"
					title="Remove Breakpoint"
				>
					&times;
				</button>
			</li>
		</ul>
	</ScrollArea>
	</div>
</template>

<script lang="ts" setup>
import { inject, type Ref, watch } from "vue";
import { useBreakpoints } from "@/composables/useBreakpoints";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { ScrollArea } from '../../components/ui/scroll-area';
import BreakpointAddControl from "./BreakpointAddControl.vue";

	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

	const vm = inject<Ref<VirtualMachine>>("vm");
	const { breakpoints, removeBreakpoint, toggleBreakpointEnable, loadBreakpoints } = useBreakpoints();

	watch(() => vm?.value, (newVm) => {
		if (newVm) loadBreakpoints(newVm);
	}, { immediate: true });

	const handleRemoveBreakpoint = (bp: Breakpoint) => removeBreakpoint(bp, vm?.value);
	const handleToggleEnable = (bp: Breakpoint) => toggleBreakpointEnable(bp, vm?.value);

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
