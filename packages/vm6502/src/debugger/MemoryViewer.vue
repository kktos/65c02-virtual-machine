<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col" ref="scrollContainer">
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
			class="font-mono text-xs overflow-y-hidden flex-grow min-h-0 bg-gray-900 p-2 rounded-md"
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
				<tbody v-if="visibleRowCount > 0">
					<tr v-for="lineIndex in visibleRowCount" :key="lineIndex" class="hover:bg-gray-700/50 transition duration-100 text-gray-300">
						<td class="py-0.5 text-left text-indigo-300 font-bold">
							{{ '$' + (startAddress + (lineIndex - 1) * BYTES_PER_LINE).toString(16).toUpperCase().padStart(4, '0') }}
						</td>

						<td v-for="byteIndex in BYTES_PER_LINE" :key="byteIndex" class="p-0">
							<input
								type="text"
								:value="editingIndex === ((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)) ? editingValue : currentMemorySlice[(lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)]?.toString(16).toUpperCase().padStart(2, '0')"
								:ref="(el) => setInputRef(el, (lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1))"
								@keydown="handleKeyDown((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event)"
								@input="handleByteChange((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event)"
								@focus="handleFocus((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event)"
								@blur="handleBlur"
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

import { computed, inject, nextTick, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import { bytesToAscii } from "@/lib/array.utils";
import type { VirtualMachine } from "@/vm.class";

	const vm= inject<Ref<VirtualMachine>>("vm");
	const subscribeToUiUpdates= inject<(callback: () => void) => void>("subscribeToUiUpdates");

	interface Props {
		memory: Uint8Array<ArrayBufferLike>;
	}

	const { memory } = defineProps<Props>();

	const startAddress = ref(0x0200);
	const BYTES_PER_LINE = 16;

	const scrollContainer = ref<HTMLElement | null>(null);
	const containerHeight = ref(0);
	const ROW_HEIGHT_ESTIMATE = 22; // Estimated height of a row in pixels
	let resizeObserver: ResizeObserver | null = null;

	const visibleRowCount = computed(() => {
		if (containerHeight.value === 0) return 10; // Default before mounted
		return Math.max(1, Math.floor(containerHeight.value / ROW_HEIGHT_ESTIMATE));
	});

	// This will be our reactive trigger to update the view
	const tick = ref(0);

	onMounted(() => {
		if (scrollContainer.value) {
			// Set initial height and observe for changes
			containerHeight.value = scrollContainer.value.clientHeight;
			resizeObserver = new ResizeObserver(entries => {
				if (entries[0]) containerHeight.value = entries[0].contentRect.height;
			});
			resizeObserver.observe(scrollContainer.value);
		}

		// Subscribe to the UI update loop from App.vue
		subscribeToUiUpdates?.(() => {
			tick.value++;
		});
	});

	onUnmounted(() => resizeObserver?.disconnect());

	const handleAddressChange = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value, 16);
		if (!Number.isNaN(value) && value >= 0 && value <= 0xFFFF) {
			startAddress.value = value;
		}
	};

	const editingIndex = ref<number | null>(null);
	const editingValue = ref("");
	const inputRefs = ref<Map<number, HTMLInputElement>>(new Map());

	const setInputRef = (el: any, index: number) => {
		if (el) {
			inputRefs.value.set(index, el as HTMLInputElement);
		} else {
			inputRefs.value.delete(index);
		}
	};

	const handleFocus = (index: number, event: FocusEvent) => {
		editingIndex.value = index;
		const target = event.target as HTMLInputElement;
		editingValue.value = target.value;
		target.select();
	};

	const handleBlur = () => {
		editingIndex.value = null;
	};

	const handleKeyDown = (index: number, event: KeyboardEvent) => {
		let direction = 0;
		if (event.key === "ArrowUp") direction = -BYTES_PER_LINE;
		else if (event.key === "ArrowDown") direction = BYTES_PER_LINE;
		else if (event.key === "ArrowLeft") direction = -1;
		else if (event.key === "ArrowRight") direction = 1;
		else return;

		event.preventDefault();

		const currentAbs = startAddress.value + index;
		const targetAbs = currentAbs + direction;

		if (targetAbs < 0 || targetAbs > 0xFFFF) return;

		const visibleBytes = visibleRowCount.value * BYTES_PER_LINE;
		const endAddress = startAddress.value + visibleBytes;

		if (targetAbs >= startAddress.value && targetAbs < endAddress) {
			const targetIndex = targetAbs - startAddress.value;
			inputRefs.value.get(targetIndex)?.focus();
		} else {
			if (targetAbs < startAddress.value) {
				startAddress.value = Math.max(0, startAddress.value - BYTES_PER_LINE);
			} else {
				startAddress.value = Math.min(0xFFFF, startAddress.value + BYTES_PER_LINE);
			}

			nextTick(() => {
				const newTargetIndex = targetAbs - startAddress.value;
				if (newTargetIndex >= 0 && newTargetIndex < visibleBytes) {
					inputRefs.value.get(newTargetIndex)?.focus();
				}
			});
		}
	};

	const handleByteChange = (index: number, event: Event) => {
		const target = event.target as HTMLInputElement;
		if (editingIndex.value === index) editingValue.value = target.value;
		const value = parseInt(target.value, 16);
		if (!Number.isNaN(value) && value >= 0 && value <= 0xFF) {
			vm?.value.updateMemory(startAddress.value + index, value);
		}
	};

	const handleWheel = (event: WheelEvent) => {
		event.preventDefault();
		const scrollAmount = BYTES_PER_LINE * (event.ctrlKey ? visibleRowCount.value : 1);

		if (event.deltaY > 0) {
			// Scrolling down -> increase address
			const newAddress = startAddress.value + scrollAmount;
			startAddress.value = Math.min(newAddress, 0xFFFF - (visibleRowCount.value * BYTES_PER_LINE) + 1);
		} else if (event.deltaY < 0) {
			// Scrolling up -> decrease address
			const newAddress = startAddress.value - scrollAmount;
			startAddress.value = Math.max(newAddress, 0);
		}
	};

	const currentMemorySlice = ref<Uint8Array>(new Uint8Array());

	// Watch for changes in startAddress or the tick, and update the slice
	watch([startAddress, tick, visibleRowCount], () => {
		const start = startAddress.value;
		const end = start + visibleRowCount.value * BYTES_PER_LINE;
		currentMemorySlice.value = memory.slice(start, end);
	}, { immediate: true });


</script>
