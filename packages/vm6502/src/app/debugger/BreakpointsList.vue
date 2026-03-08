<template>
	<div class="flex flex-col h-full gap-2">
		<BreakpointAddControl />
		<ScrollArea class="flex-1 min-h-0 w-full" type="always">
			<ul class="space-y-2 text-sm text-gray-300 p-2 bg-gray-900 rounded-md min-h-full">
				<li v-if="breakpoints.length === 0" class="text-gray-500 italic p-2 text-center">
					No active breakpoints.
				</li>
				<li
					v-for="(bp, index) in breakpoints"
					:key="bp.address + bp.type + index"
					:class="[
						'flex items-stretch bg-gray-800 rounded-md hover:bg-gray-700/80 transition duration-100 font-mono overflow-hidden',
						!bp.enabled ? 'opacity-60' : '',
					]"
				>
					<span
						:class="[
							'flex items-center justify-center w-15 text-xs font-bold text-white',
							getTypeStyles(bp.type).bg,
						]"
						:title="bp.command ? `Hook on ${bp.type}` : bp.type"
					>
						<span class="tracking-wider uppercase flex flex-col items-center">
							{{ bp.type }}<FishingHook v-if="bp.command" class="w-4 h-4" />
						</span>
					</span>
					<div class="flex-1 flex justify-between items-center pl-3 pr-2">
						<div class="flex items-center space-x-3 flex-1 min-w-0">
							<input
								type="checkbox"
								:checked="bp.enabled"
								@change="handleToggleEnable(bp)"
								class="form-checkbox h-4 w-4 text-cyan-600 transition duration-150 ease-in-out bg-gray-700 border-gray-500 rounded focus:ring-offset-gray-900 cursor-pointer focus:ring-cyan-500"
								title="Enable/Disable Breakpoint"
							/>
							<span class="text-indigo-300">
								{{ formatAddress(bp.address) }}
								<span v-if="bp.endAddress && bp.endAddress !== bp.address">
									-
									{{ formatAddress(bp.endAddress) }}
								</span>
							</span>
							<div
								v-if="bp.command || editingBpKey === getBreakpointKey(bp)"
								class="flex items-baseline gap-1 text-xs text-cyan-300 flex-1 min-w-0"
							>
								<span class="font-semibold text-cyan-500">RUNS:</span>
								<div v-if="editingBpKey === getBreakpointKey(bp)" class="flex-1">
									<input
										ref="editInput"
										v-model="editingCommand"
										type="text"
										class="bg-gray-900/90 px-1.5 py-0.5 rounded-sm text-cyan-200 font-mono text-xs w-full focus:ring-1 focus:ring-cyan-400 focus:outline-none border border-cyan-700"
										@blur="saveEdit(bp)"
										@keydown.enter.prevent="saveEdit(bp)"
										@keydown.esc.prevent="cancelEdit"
									/>
								</div>
								<code
									v-else
									class="bg-gray-900/70 px-1.5 py-0.5 rounded-sm text-cyan-200 cursor-pointer hover:bg-gray-900 flex-1 truncate"
									title="Click to edit command"
									@click="startEditing(bp)"
								>
									{{ bp.command }}
								</code>
							</div>
							<div v-else class="flex-1 flex justify-start items-center">
								<button
									@click="startEditing(bp)"
									title="Add hook command"
									class="ml-2 p-1 rounded-full hover:bg-gray-900/70 transition-colors"
								>
									<FishingHook class="w-4 h-4 text-gray-500 hover:text-cyan-400" />
								</button>
							</div>
						</div>
						<button
							@click="handleRemoveBreakpoint(bp)"
							class="text-red-500 hover:text-red-400 text-lg p-1"
							title="Remove Breakpoint"
						>
							&times;
						</button>
					</div>
				</li>
			</ul>
		</ScrollArea>
	</div>
</template>

<script lang="ts" setup>
import { inject, type Ref, watch, ref, nextTick } from "vue";
import { useBreakpoints, type BreakpointState } from "@/composables/useBreakpoints";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { ScrollArea } from "../../components/ui/scroll-area";
import BreakpointAddControl from "./BreakpointAddControl.vue";
import { formatAddress } from "@/lib/hex.utils";
import { FishingHook } from "lucide-vue-next";
const vm = inject<Ref<VirtualMachine>>("vm");
const { breakpoints, removeBreakpoint, toggleBreakpointEnable, loadBreakpoints, updateBreakpointCommand } =
	useBreakpoints();

const editingBpKey = ref<string | null>(null);
const editingCommand = ref("");
const editInput = ref<HTMLInputElement | null>(null);

// The key generation logic must match useBreakpoints
const getBreakpointKey = (bp: Breakpoint) => {
	return `${bp.type}|${bp.address}|${bp.endAddress ?? "null"}`;
};

watch(
	() => vm?.value,
	(newVm) => {
		if (newVm) loadBreakpoints(newVm);
	},
	{ immediate: true },
);

watch(editingBpKey, (newKey) => {
	if (newKey) {
		nextTick(() => {
			editInput.value?.focus();
		});
	}
});

const startEditing = (bp: BreakpointState) => {
	editingBpKey.value = getBreakpointKey(bp);
	editingCommand.value = bp.command || "";
};

const cancelEdit = () => {
	editingBpKey.value = null;
};

const saveEdit = (bp: BreakpointState) => {
	if (editingBpKey.value === getBreakpointKey(bp)) {
		updateBreakpointCommand(bp, editingCommand.value);
		editingBpKey.value = null;
	}
};

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
