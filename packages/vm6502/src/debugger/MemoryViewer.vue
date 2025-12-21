<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col" ref="scrollContainer">
		<div class="mb-3 mt-1 flex flex-wrap items-center gap-4 shrink-0">
			<div class="flex items-center space-x-2">
				<span class="text-gray-300 text-sm">Addr:</span>
				<div class="flex items-center">
					<input
						type="text"
						:value="((startAddress >> 16) & 0xFF).toString(16).toUpperCase().padStart(2, '0')"
						@input="handleBankChange"
						class="bg-gray-700 text-yellow-300 font-mono text-sm rounded-l-md px-2 py-1 w-10 border-y border-l border-gray-600 focus:ring-2 focus:ring-cyan-500 tabular-nums text-center outline-none"
					/>
					<span class="bg-gray-700 text-gray-400 font-mono text-sm py-1 border-y border-gray-600">:</span>
					<input
						type="text"
						:value="(startAddress & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')"
						@input="handleOffsetChange"
						class="bg-gray-700 text-yellow-300 font-mono text-sm rounded-r-md px-2 py-1 w-16 border-y border-r border-gray-600 focus:ring-2 focus:ring-cyan-500 tabular-nums outline-none"
					/>
				</div>
			</div>
			<!-- Debug Options -->
			<div v-for="opt in debugOptions" :key="opt.id" class="flex items-center space-x-1">
				<input
					v-if="opt.type === 'boolean'"
					type="checkbox"
					:id="opt.id"
					v-model="debugOverrides[opt.id]"
					class="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500 h-4 w-4"
				/>
				<label :for="opt.id" class="text-gray-300 text-xs select-none cursor-pointer">{{ opt.label }}</label>
				<select
					v-if="opt.type === 'select'"
					:id="opt.id"
					v-model="debugOverrides[opt.id]"
					class="bg-gray-700 text-yellow-300 font-mono text-xs rounded-md px-2 py-0.5 border border-gray-600 focus:ring-2 focus:ring-cyan-500 outline-none"
				>
					<option v-for="option in opt.options" :key="option.value" :value="option.value">{{ option.label }}</option>
				</select>
			</div>
		</div>

		<div
			class="font-mono text-xs overflow-y-hidden flex-grow min-h-0 bg-gray-900 p-2 rounded-md"
			@wheel="handleWheel"
		>
			<table class="w-full table-fixed">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md">
						<th class="py-1 text-left w-24">Addr</th>
						<th v-for="i in BYTES_PER_LINE" :key="i" class="text-center w-[1.75rem]">{{ '+' + (i - 1).toString(16).toUpperCase() }}</th>
						<th class="py-1 text-left w-auto pl-4">ASCII</th>
					</tr>
				</thead>
				<tbody v-if="visibleRowCount > 0">
					<tr v-for="lineIndex in visibleRowCount" :key="lineIndex" class="hover:bg-gray-700/50 transition duration-100 text-gray-300">
						<td class="py-0.5 text-left text-indigo-300 font-bold font-mono">
							{{ formatAddress(startAddress + (lineIndex - 1) * BYTES_PER_LINE) }}
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
import type { DebugOption } from "@/cpu/bus.interface";
import { bytesToAscii } from "@/lib/array.utils";
import type { VirtualMachine } from "@/virtualmachine.class";

	const vm= inject<Ref<VirtualMachine>>("vm");
	const subscribeToUiUpdates= inject<(callback: () => void) => void>("subscribeToUiUpdates");

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

	const debugOptions = ref<DebugOption[]>([]);
	const debugOverrides = ref<Record<string, unknown>>({});

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

	watch(() => vm?.value, async (newVm) => {
		if (newVm) {
			await newVm.ready;
			debugOptions.value = newVm.getDebugOptions();
			// Initialize overrides
			debugOverrides.value = {};
			debugOptions.value.forEach((opt) => {
				if (opt.type === "select" && opt.options?.length) {
					debugOverrides.value[opt.id] = opt.options[0]?.value;
				} else {
					debugOverrides.value[opt.id] = false;
				}
			});
		}
	}, { immediate: true });

	const handleBankChange = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const val = parseInt(target.value, 16);
		if (!Number.isNaN(val) && val >= 0 && val <= 0xFF) {
			startAddress.value = (startAddress.value & 0xFFFF) | (val << 16);
		}
	};

	const handleOffsetChange = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const val = parseInt(target.value, 16);
		if (!Number.isNaN(val) && val >= 0 && val <= 0xFFFF) {
			startAddress.value = (startAddress.value & 0xFF0000) | val;
		}
	};

	const formatAddress = (addr: number) => {
		const bank = ((addr >> 16) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
		const offset = (addr & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
		return `$${bank}:${offset}`;
	};

	const editingIndex = ref<number | null>(null);
	const editingValue = ref("");
	const inputRefs = ref<Map<number, HTMLInputElement>>(new Map());

	const setInputRef = (el: unknown, index: number) => {
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

		if (targetAbs < 0 || targetAbs > 0xFFFFFF) return;

		const visibleBytes = visibleRowCount.value * BYTES_PER_LINE;
		const endAddress = startAddress.value + visibleBytes;

		if (targetAbs >= startAddress.value && targetAbs < endAddress) {
			const targetIndex = targetAbs - startAddress.value;
			inputRefs.value.get(targetIndex)?.focus();
		} else {
			if (targetAbs < startAddress.value) {
				startAddress.value = Math.max(0, startAddress.value - BYTES_PER_LINE);
			} else {
				startAddress.value = Math.min(0xFFFFFF, startAddress.value + BYTES_PER_LINE);
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
			vm?.value.writeDebug(startAddress.value + index, value, debugOverrides.value);
		}
	};

	const handleWheel = (event: WheelEvent) => {
		event.preventDefault();
		const scrollAmount = BYTES_PER_LINE * (event.ctrlKey ? visibleRowCount.value : 1);

		if (event.deltaY > 0) {
			// Scrolling down -> increase address
			const newAddress = startAddress.value + scrollAmount;
			startAddress.value = Math.min(newAddress, 0xFFFFFF - (visibleRowCount.value * BYTES_PER_LINE) + 1);
		} else if (event.deltaY < 0) {
			// Scrolling up -> decrease address
			const newAddress = startAddress.value - scrollAmount;
			startAddress.value = Math.max(newAddress, 0);
		}
	};

	const currentMemorySlice = ref<Uint8Array>(new Uint8Array());

	// Watch for changes in startAddress or the tick, and update the slice
	watch([startAddress, tick, visibleRowCount, debugOverrides], () => {
		const start = startAddress.value;
		const length = visibleRowCount.value * BYTES_PER_LINE;
		const slice = new Uint8Array(length);

		if (vm?.value) {
			for (let i = 0; i < length; i++) {
				slice[i] = vm.value.readDebug(start + i, debugOverrides.value);
			}
		}
		currentMemorySlice.value = slice;
	}, { immediate: true, deep: true });


</script>
