<template>
	<div ref="scrollContainer" class="p-4 bg-gray-800 rounded-lg shadow-xl flex flex-col h-full">
		<DebuggerPanelTitle title="Stack ($0100 - $01FF)" />
		<div class="font-mono text-xs overflow-y-auto flex-grow min-h-0 bg-gray-900 p-2 rounded-md" style="line-height: 1.4;">
			<table class="w-full">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md">
						<th class="py-1 text-left px-2 w-1/4">Addr</th>
						<th class="py-1 text-left">Value</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="(item, index) in visibleStackSlice"
						:key="index"
						:class="[
							'hover:bg-gray-700/50 transition duration-100',
							item.address === stackPointerAddress ? 'bg-indigo-900/50 text-indigo-100 font-bold border-l-4 border-indigo-400' : 'text-gray-300'
						]"
						:ref="el => { if (item.address === stackPointerAddress) spElement = el as HTMLElement }"
					>
						<td class="py-0.5 px-2 tabular-nums text-indigo-300">
							{{ '$' + item.address.toString(16).toUpperCase().padStart(4, '0') }}
						</td>
						<td class="p-0">
							<input
								type="text"
								:value="item.value.toString(16).toUpperCase().padStart(2, '0')"
								@input="handleByteChange(item.address, $event)"
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

import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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

	const ROW_HEIGHT_ESTIMATE = 25;
	const scrollContainer = ref<HTMLElement | null>(null);
	const containerHeight = ref(0);

	const spElement = ref<HTMLElement | null>(null);
	let resizeObserver: ResizeObserver | null = null;

	// Calculate how many items can fit
	const visibleRowCount = computed(() => {
		if (containerHeight.value === 0) return 1;//items.value.length
		return Math.floor(containerHeight.value / ROW_HEIGHT_ESTIMATE);
	})

	const stackPointerAddress = computed(() => stackBase + registers.SP);

	const visibleStackSlice = computed(() => {
		// This computed property is reactive to registers.SP and visibleLines
		const spOffset = registers.SP ?? 0xFF;
		if (!stackData || stackData.length < 0x0200) return [];

		const half = Math.floor(visibleRowCount.value / 2);
		let startOffset = Math.max(0, spOffset - half);
		let endOffset = Math.min(255, spOffset + half);

		// Adjust window if we are near the edges of the stack
		if (spOffset < half) {
			endOffset = Math.min(255, visibleRowCount.value);
		}
		if (spOffset > 255 - half) {
			startOffset = Math.max(0, 255 - visibleRowCount.value);
		}

		const slice = stackData.slice(stackBase + startOffset, stackBase + endOffset);
		return [...slice].map((value, i) => ({
			address: stackBase + startOffset + i,
			value,
		})).reverse(); // Reverse to show higher addresses at the top
	});

	onMounted(() => {
		if (scrollContainer.value) {
			resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					containerHeight.value = entry.contentRect.height
				}
			})
			resizeObserver.observe(scrollContainer.value)
		}
	});

	onUnmounted(() => {
		if (resizeObserver) {
			resizeObserver.disconnect()
		}
	});

	// onMounted(() => {
	// 	if (scrollContainer.value) {
	// 		resizeObserver = new ResizeObserver(entries => {
	// 			const height = entries[0].contentRect.height;
	// 			const newVisibleLines = Math.ceil(height / ROW_HEIGHT_ESTIMATE) + 2; // +2 for buffer
	// 			if (newVisibleLines !== visibleLines.value) {
	// 				visibleLines.value = newVisibleLines;
	// 			}
	// 		});
	// 		resizeObserver.observe(scrollContainer.value);
	// 	}
	// });

	// onUnmounted(() => {
	// 	resizeObserver?.disconnect();
	// });

	watch(spElement, (el) => {
		// When the element pointed to by SP changes, scroll it into view.
		el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});

	const handleByteChange = (addr: number, event: InputEvent) => {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value, 16);
		if (!Number.isNaN(value) && value >= 0 && value <= 0xFF)
			controls.updateMemory(addr, value);

	};

</script>
