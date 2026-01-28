<template>
	<div class="flex gap-2 p-2 bg-gray-800 rounded-md items-center shrink-0">
		<select v-model="newBpType" class="bg-gray-700 text-white text-xs rounded p-1 border border-gray-600 focus:border-indigo-500 outline-none">
			<option value="pc">PC</option>
			<option value="read">Read</option>
			<option value="write">Write</option>
			<option value="access">Access</option>
		</select>
		<input
			v-model="newBpAddressStr"
			type="text"
			placeholder="Addr or Range (Hex)"
			title="A900 or 2000-2FFF or 2000:2FFF"
			class="bg-gray-700 text-white text-xs rounded p-1 border border-gray-600 focus:border-indigo-500 outline-none w-24 font-mono"
			@keydown.enter="handleAddBreakpoint"
		/>
		<button
			@click="handleAddBreakpoint"
			class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1 rounded transition-colors"
		>
			Add
		</button>
	</div>
</template>

<script lang="ts" setup>
import { inject, type Ref, ref } from "vue";
import { useBreakpoints } from "@/composables/useBreakpoints";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const { addBreakpoint } = useBreakpoints();

const newBpType = ref<Breakpoint['type']>('pc');
const newBpAddressStr = ref('');

const handleAddBreakpoint = () => {
	const parts = newBpAddressStr.value.split(/[-:]/) as [string, string];
	const addr = parseInt(parts[0], 16);
	if (Number.isNaN(addr)) return;

	let endAddr = addr;
	if (parts.length > 1) {
		const end = parseInt(parts[1], 16);
		if (!Number.isNaN(end)) {
			endAddr = end;
		}
	}

	const bp: Breakpoint = { type: newBpType.value, address: addr };
	if (endAddr !== addr) bp.endAddress = endAddr;

	addBreakpoint(bp, vm?.value);
	newBpAddressStr.value = '';
};
</script>
