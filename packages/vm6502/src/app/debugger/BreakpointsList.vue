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
					<div
						v-if="editingBpKey === getBreakpointKey(bp) && editingField === 'type'"
						class="flex items-center justify-center w-15 bg-gray-800"
					>
						<select
							ref="editInput"
							v-model="editValue"
							class="w-full text-[10px] font-bold uppercase bg-gray-700 text-white border-none outline-none py-1 text-center cursor-pointer focus:ring-1 focus:ring-cyan-500 rounded-sm"
							@blur="saveEdit(bp)"
							@change="saveEdit(bp)"
							@keydown.esc.prevent="cancelEdit"
						>
							<option value="pc">PC</option>
							<option value="read">READ</option>
							<option value="write">WRITE</option>
							<option value="access">ACCESS</option>
						</select>
					</div>
					<span
						v-else
						:class="[
							'flex items-center justify-center w-15 text-xs font-bold text-white',
							getTypeStyles(bp.type).bg,
						]"
						:title="bp.command ? `Hook on ${bp.type}` : bp.type"
						@click="startEditing(bp, 'type')"
					>
						<span
							class="tracking-wider uppercase flex flex-col items-center cursor-pointer hover:scale-110 transition-transform"
						>
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
							<div
								v-if="editingBpKey === getBreakpointKey(bp) && editingField === 'address'"
								class="flex items-center"
							>
								<input
									ref="editInput"
									v-model="editValue"
									class="bg-gray-900/90 px-1 py-0 rounded-sm text-indigo-200 font-mono text-sm w-32 focus:ring-1 focus:ring-indigo-400 focus:outline-none border border-indigo-700"
									@blur="saveEdit(bp)"
									@keydown.enter.prevent="saveEdit(bp)"
									@keydown.esc.prevent="cancelEdit"
								/>
							</div>
							<span
								v-else
								class="text-indigo-300 cursor-pointer hover:text-white border-b border-transparent hover:border-indigo-500/50 transition-colors"
								@click="startEditing(bp, 'address')"
							>
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
								<div
									v-if="editingBpKey === getBreakpointKey(bp) && editingField === 'command'"
									class="flex-1"
								>
									<input
										ref="editInput"
										v-model="editValue"
										type="text"
										class="bg-gray-900/90 px-1.5 py-0.5 rounded-sm text-cyan-200 font-mono text-xs w-full focus:ring-1 focus:ring-cyan-400 focus:outline-none border border-cyan-700"
										@blur="saveEdit(bp)"
										@keydown.enter.prevent="saveEdit(bp)"
										@keydown.esc.prevent="cancelEdit"
									/>
								</div>
								<code
									v-else
									class="px-1.5 py-0.5 rounded-sm text-cyan-200 cursor-pointer hover:bg-gray-900 flex-1 truncate"
									title="Click to edit command"
									@click="startEditing(bp, 'command')"
								>
									{{ bp.command }}
								</code>
							</div>
							<div v-else class="flex-1 flex justify-start items-center">
								<button
									@click="startEditing(bp, 'command')"
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
import { formatAddress, toHex } from "@/lib/hex.utils";
import { FishingHook } from "lucide-vue-next";

const vm = inject<Ref<VirtualMachine>>("vm");

const {
	breakpoints,
	addBreakpoint,
	removeBreakpoint,
	toggleBreakpointEnable,
	loadBreakpoints,
	updateBreakpointCommand,
	getBreakpointKey,
} = useBreakpoints();

const editingBpKey = ref<string | null>(null);
const editingField = ref<"type" | "address" | "command" | null>(null);
const editValue = ref("");
const editInput = ref<(HTMLInputElement | HTMLSelectElement)[] | null>(null);

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
			editInput.value?.[0]?.focus();
		});
	}
});

const startEditing = (bp: BreakpointState, field: "type" | "address" | "command") => {
	editingBpKey.value = getBreakpointKey(bp);
	editingField.value = field;
	switch (field) {
		case "command":
			editValue.value = bp.command || "";
			break;
		case "address":
			editValue.value = toHex(bp.address);
			if (bp.endAddress && bp.endAddress !== bp.address) {
				editValue.value += "-" + toHex(bp.endAddress);
			}
			break;
		case "type":
			editValue.value = bp.type;
			break;
	}
};

const cancelEdit = () => {
	editingBpKey.value = null;
	editingField.value = null;
	editValue.value = "";
};

const saveEdit = (bp: BreakpointState) => {
	if (editingBpKey.value === getBreakpointKey(bp)) {
		switch (editingField.value) {
			case "command":
				updateBreakpointCommand(bp, editValue.value);
				break;
			case "address": {
				const cleanVal = editValue.value.replace(/[$:]/g, "").trim();
				const parts = cleanVal.split("-");
				let newAddr = parseInt(parts[0], 16);
				let newEnd = newAddr;
				if (parts.length > 1 && parts[1].trim()) {
					const endVal = parseInt(parts[1], 16);
					if (!Number.isNaN(endVal)) {
						newEnd = Math.max(newAddr, endVal);
						newAddr = Math.min(newAddr, endVal);
					}
				}

				if (!Number.isNaN(newAddr) && (newAddr !== bp.address || newEnd !== (bp.endAddress ?? bp.address))) {
					removeBreakpoint(bp, vm?.value);
					bp.address = newAddr;
					bp.endAddress = newEnd !== newAddr ? newEnd : undefined;
					addBreakpoint(bp, vm?.value);
				}
				break;
			}
			case "type": {
				if (editValue.value === bp.type) break;
				removeBreakpoint(bp, vm?.value);
				bp.type = editValue.value as Breakpoint["type"];
				addBreakpoint(bp, vm?.value);
				break;
			}
		}

		cancelEdit();
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
