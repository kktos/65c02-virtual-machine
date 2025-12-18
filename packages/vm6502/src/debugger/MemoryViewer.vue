<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col">
		<div class="mb-3 mt-1 flex items-center space-x-2 shrink-0">
			<span class="text-gray-300 text-sm">Start Address:</span>
			<input
				type="text"
				:value="startAddress.toString(16).toUpperCase().padStart(4, '0')"
				@input="handleAddressChange"
				class="bg-gray-700 text-yellow-300 font-mono text-sm rounded-md px-2 py-1 w-20 border border-gray-600 focus:ring-2 focus:ring-cyan-500 tabular-nums"
			/>
		</div>

		<div
			class="font-mono text-xs overflow-y-auto flex-grow min-h-0 bg-gray-900 p-2 rounded-md"
			@wheel="handleWheel"
		>
			<table class="w-full table-fixed">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md">
						<th class="py-1 text-left w-16">Addr</th>
						<th v-for="i in BYTES_PER_LINE" :key="i" class="text-center w-[1.75rem]">{{ '+' + (i - 1).toString(16).toUpperCase() }}</th>
						<th class="py-1 text-left w-auto pl-4">ASCII</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="lineIndex in MEMORY_LINES" :key="lineIndex" class="hover:bg-gray-700/50 transition duration-100 text-gray-300">
						<td class="py-0.5 text-left text-indigo-300 font-bold">
							{{ '$' + (startAddress + (lineIndex - 1) * BYTES_PER_LINE).toString(16).toUpperCase().padStart(4, '0') }}
						</td>

						<td v-for="byteIndex in BYTES_PER_LINE" :key="byteIndex" class="p-0">
							<input
								type="text"
								:value="currentMemorySlice[(lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)]?.toString(16).toUpperCase().padStart(2, '0')"
								@input="handleByteChange((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event)"
								maxlength="2"
								class="w-full text-center bg-transparent focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums text-xs"
							/>
						</td>

						<td class="py-0.5 text-left text-green-300 font-bold pl-4 whitespace-nowrap">
							{{ bytesToAscii(currentMemorySlice.slice((lineIndex - 1) * BYTES_PER_LINE, lineIndex * BYTES_PER_LINE)) }}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script lang="ts" setup>
	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

import { onMounted, ref, watch } from "vue";
import { bytesToAscii } from "@/lib/array.utils";

	interface Props {
		memory: Uint8Array<SharedArrayBuffer>;
		controls: {
			updateMemory: (addr: number, value: number) => void;
		},
		subscribeToUiUpdates: (callback: () => void) => void;
	}

	const { memory,  controls, subscribeToUiUpdates } = defineProps<Props>();

	const startAddress = ref(0x0200);
	const MEMORY_LINES = 10;
	const BYTES_PER_LINE = 16;

	// This will be our reactive trigger to update the view
	const tick = ref(0);

	onMounted(() => {
		// Subscribe to the UI update loop from App.vue
		subscribeToUiUpdates(() => {
			tick.value++;
		});
	});

	const handleAddressChange = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value, 16);
		if (!Number.isNaN(value) && value >= 0 && value <= 0xFFFF) {
			startAddress.value = value;
		}
	};

	const handleByteChange = (index: number, event: Event) => {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value, 16);
		if (!Number.isNaN(value) && value >= 0 && value <= 0xFF) {
			controls.updateMemory(startAddress.value + index, value);
		}
	};

	const handleWheel = (event: WheelEvent) => {
		event.preventDefault();
		const scrollAmount = BYTES_PER_LINE; // Scroll by one full line

		if (event.deltaY > 0) {
			// Scrolling down -> increase address
			const newAddress = startAddress.value + scrollAmount;
			startAddress.value = Math.min(newAddress, 0xFFFF - (MEMORY_LINES * BYTES_PER_LINE) + 1);
		} else if (event.deltaY < 0) {
			// Scrolling up -> decrease address
			const newAddress = startAddress.value - scrollAmount;
			startAddress.value = Math.max(newAddress, 0);
		}
	};

	const currentMemorySlice = ref<Uint8Array>(new Uint8Array());

	// Watch for changes in startAddress or the tick, and update the slice
	watch([startAddress, tick], () => {
		const start = startAddress.value;
		const end = start + MEMORY_LINES * BYTES_PER_LINE;
		currentMemorySlice.value = memory.slice(start, end);
	}, { immediate: true });


</script>
