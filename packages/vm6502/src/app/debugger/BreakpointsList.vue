<template>
	<div class="flex flex-col h-full gap-2">
		<BreakpointAddControl />
		<ScrollArea class="flex-1 min-h-0 w-full" type="always">
			<ul class="space-y-2 text-sm text-gray-300 p-2 bg-gray-900 rounded-md min-h-full">
				<li v-if="breakpoints.length === 0" class="text-gray-500 italic p-2 text-center">No active breakpoints.</li>
				<li
					v-for="(bp, index) in breakpoints"
					:key="bp.address + bp.type + index"
					:class="[
						'flex items-stretch bg-gray-800 rounded-md hover:bg-gray-700/80 transition duration-100 font-mono overflow-hidden',
						!bp.enabled ? 'opacity-60' : '',
					]"
				>
					<span :class="['flex items-center justify-center w-15 text-xs font-bold text-white', getTypeStyles(bp.type).bg]" :title="bp.type">
						<span class="tracking-wider uppercase">
							{{ bp.type }}
						</span>
					</span>
					<div class="flex-1 flex justify-between items-center pl-3 pr-2">
						<div class="flex items-center space-x-3">
							<input
								type="checkbox"
								:checked="bp.enabled"
								@change="handleToggleEnable(bp)"
								class="form-checkbox h-4 w-4 text-cyan-600 transition duration-150 ease-in-out bg-gray-700 border-gray-500 rounded focus:ring-offset-gray-900 cursor-pointer focus:ring-cyan-500"
								title="Enable/Disable Breakpoint"
							/>
							<span class="text-indigo-300">
								{{ "$" + bp.address.toString(16).toUpperCase().padStart(4, "0") }}
								<span v-if="bp.endAddress && bp.endAddress !== bp.address">
									-
									{{ "$" + bp.endAddress.toString(16).toUpperCase().padStart(4, "0") }}
								</span>
							</span>
						</div>
						<button @click="handleRemoveBreakpoint(bp)" class="text-red-500 hover:text-red-400 text-lg p-1" title="Remove Breakpoint">
							&times;
						</button>
					</div>
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
import { ScrollArea } from "../../components/ui/scroll-area";
import BreakpointAddControl from "./BreakpointAddControl.vue";

/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

const vm = inject<Ref<VirtualMachine>>("vm");
const { breakpoints, removeBreakpoint, toggleBreakpointEnable, loadBreakpoints } = useBreakpoints();

watch(
	() => vm?.value,
	(newVm) => {
		if (newVm) loadBreakpoints(newVm);
	},
	{ immediate: true },
);

const handleRemoveBreakpoint = (bp: Breakpoint) => removeBreakpoint(bp, vm?.value);
const handleToggleEnable = (bp: Breakpoint) => toggleBreakpointEnable(bp, vm?.value);

const getTypeStyles = (type: Breakpoint["type"]) => {
	switch (type) {
		case "pc":
			return { bg: "bg-indigo-700" };
		case "write":
			return { bg: "bg-red-700" };
		case "read":
			return { bg: "bg-yellow-700" };
		case "access":
			return { bg: "bg-green-700" };
		default:
			return { bg: "bg-gray-700" };
	}
};
</script>
