<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col">
		<DebuggerPanelTitle title="Stack ($0100 - $01FF)" />
		<div class="font-mono text-xs overflow-y-auto flex-grow min-h-0 bg-gray-900 p-2 rounded-md">
			<table class="w-full">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md">
						<th class="py-1 text-left px-2 w-1/4">Addr</th>
						<th class="py-1 text-left">Value</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="(value, index) in stackSlice"
						:key="index"
						:class="[
							'hover:bg-gray-700/50 transition duration-100',
							(stackBase + 0xFF - index) === stackPointerAddress ? 'bg-indigo-900/50 text-indigo-100 font-bold border-l-4 border-indigo-400' : 'text-gray-300'
						]"
					>
						<td class="py-0.5 px-2 tabular-nums text-indigo-300">
							{{ '$' + (stackBase + 0xFF - index).toString(16).toUpperCase().padStart(4, '0') }}
						</td>
						<td class="p-0">
							<input
								type="text"
								:value="value.toString(16).toUpperCase().padStart(2, '0')"
								@input="handleByteChange((stackBase + 0xFF - index), $event)"
								maxlength="2"
								class="w-full text-left bg-transparent focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums"
							/>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script lang="ts" setup>
	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

import { computed } from "vue";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import DebuggerPanelTitle from './DebuggerPanelTitle.vue';


	const stackBase = 0x0100;

	interface Props {
		stackData: Uint8Array<SharedArrayBuffer>;
		controls: {
			updateMemory: (addr: number, value: number) => void;
		},
		registers: EmulatorState['registers']
	}
	const { stackData, controls, registers } = defineProps<Props>();

	// Defensive check for props.registers in computed property
	const stackPointerAddress = computed(() => {
		if (registers && typeof registers.SP === 'number') {
			return stackBase + registers.SP;
		}
		return stackBase;
	});

	const stackSlice = computed(() => {
		// Read $01F0 to $01FF and reverse the order for top-down display
		// Safety check for stackData length
		if (!stackData || stackData.length < 0x100) return [];
		return [...stackData].slice(0xf0, 0x100).reverse();
	});

	const handleByteChange = (addr: number, event: InputEvent) => {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value, 16);
		if (!Number.isNaN(value) && value >= 0 && value <= 0xFF)
			controls.updateMemory(addr, value);

	};

</script>
