<template>
<div class="p-4 bg-gray-800 rounded-lg shadow-xl flex flex-col h-full">
	<DebuggerPanelTitle title="Stack" />
	<div ref="scrollContainer" class="flex flex-col h-full">
		<!-- <DebuggerPanelTitle title="Stack ($0100 - $01FF)" /> -->
		<div
			class="font-mono text-xs overflow-y-auto flex-grow min-h-0 bg-gray-900 p-2 rounded-md"
			style="line-height: 1.4;"
			@wheel.prevent="handleScroll"
		>
			<table class="w-full">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md">
						<th class="py-1 text-left px-2 w-[4.5rem]">Addr</th>
						<th class="py-1 text-left">Value</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="(item, index) in visibleStackSlice"
						:key="index"
						:class="[
							'hover:bg-gray-700/50 transition duration-100 border-l-4',
							item.address === stackPointerAddress ? 'bg-indigo-900/50 text-indigo-100 font-bold border-indigo-400' :
							item.isReturnAddr ? 'text-emerald-300 border-emerald-500/30 bg-emerald-900/10' : 'text-gray-300 border-transparent'
						]"
						:ref="el => { if (item.address === stackPointerAddress) spElement = el as HTMLElement }"
					>
						<td class="py-0.5 px-2 tabular-nums text-indigo-300">
							{{ '$' + item.address.toString(16).toUpperCase().padStart(4, '0') }}
						</td>
						<td class="p-0 relative">
							<div class="flex items-center">
								<input
									type="text"
									:value="item.value?.toString(16).toUpperCase().padStart(2, '0')"
									@input="handleByteChange(item.address, $event)"
									maxlength="2"
									class="w-8 text-center bg-transparent focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums"
								/>
								<div v-if="item.isLowByteForReturn" class="flex items-center text-xs text-emerald-400/80 px-2 whitespace-nowrap tabular-nums shrink-0">
									<span
										@click="handleJump(item.jsrSite!)"
										class="cursor-pointer hover:underline"
										:title="`Jump to call site $${item.jsrSite?.toString(16).toUpperCase().padStart(4, '0')}`"
									>
										{{ `$${item.jsrSite?.toString(16).toUpperCase().padStart(4, '0')}` }}
									</span>
									<span>:&nbsp;JSR&nbsp;</span>
									<span
										@click="handleJump(item.subroutineAddr!)"
										class="cursor-pointer hover:underline"
										:title="`Jump to subroutine $${item.subroutineAddr?.toString(16).toUpperCase().padStart(4, '0')}`"
									>
										{{ `$${item.subroutineAddr?.toString(16).toUpperCase().padStart(4, '0')}` }}
									</span>
								</div>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

import { computed, inject, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import DebuggerPanelTitle from './DebuggerPanelTitle.vue';

	const stackBase = 0x0100;

	const vm= inject<Ref<VirtualMachine>>("vm");
	const subscribeToUiUpdates= inject<(callback: () => void) => void>("subscribeToUiUpdates");

	interface Props {
		registers: EmulatorState['registers']
	}
	const { registers } = defineProps<Props>();

	const ROW_HEIGHT_ESTIMATE = 25;
	const scrollContainer = ref<HTMLElement | null>(null);
	const containerHeight = ref(0);

	const { jumpToAddress, setActiveTab } = useDebuggerNav();

	const handleJump = (address: number) => {
		jumpToAddress(address);
		setActiveTab('disassembly');
	};

	const spElement = ref<HTMLElement | null>(null);
	let resizeObserver: ResizeObserver | null = null;

	// Calculate how many items can fit
	const visibleRowCount = computed(() => {
		if (containerHeight.value === 0) return 1;//items.value.length
		return Math.floor(containerHeight.value / ROW_HEIGHT_ESTIMATE);
	})

	const stackPointerAddress = computed(() => stackBase + registers.SP);

	// This ref will hold the center of our view, allowing for independent scrolling.
	const viewCenterOffset = ref(registers.SP);

	const visibleStackSlice = computed(() => {
		// Access tick to create a reactive dependency on the UI update loop
		tick.value;

		const currentSP = viewCenterOffset.value ?? 0xFF; // This is the SP offset (0-255)

		const numRows = visibleRowCount.value;
		if (numRows === 0) return [];

		let startSP = currentSP - Math.floor(numRows / 2);
		let endSP = startSP + numRows;

		// Adjust for lower boundary (SP offset 0)
		if (startSP < 0) {
			startSP = 0;
			endSP = numRows; // Ensure we still get numRows items
		}

		// Adjust for upper boundary (SP offset 255)
		if (endSP > 256) { // SP offsets are 0-255, so 256 is one past the end
			endSP = 256;
			startSP = 256 - numRows; // Ensure we still get numRows items
			if (startSP < 0) startSP = 0; // Prevent negative start if numRows > 256
		}

		const slice: {
			address: number;
			value: number;
			isReturnAddr: boolean;
			isLowByteForReturn?: boolean;
			jsrSite?: number;
			subroutineAddr?: number;
		}[] = [];
		for (let i = startSP; i < endSP; i++) {
			const address = stackBase + i;
			const value = vm?.value?.readDebug(address) ?? 0;
			slice.push({ address, value, isReturnAddr: false });
		}

		// Post-process to find adjacent return address bytes
		for (let i = 0; i < slice.length - 1; i++) {
			// biome-ignore lint/style/noNonNullAssertion: <slice is built before>
			const current = slice[i]!;
			// biome-ignore lint/style/noNonNullAssertion: <slice is built before>
			const next = slice[i + 1]!;
			const vmValue = vm?.value;
			if (!vmValue) continue;

			if (next.address === current.address + 1) {
				const currentStackOffset = current.address & 0xff;
				const nextStackOffset = next.address & 0xff;

				const metaCurrent = vmValue.sharedStackMetadata[currentStackOffset];
				const metaNext = vmValue.sharedStackMetadata[nextStackOffset];

				let isPairStart = false;

				if (metaCurrent !== 0) {
					// Scan up (higher addresses) to determine chain parity.
					// An even chain starting here implies this is a LO byte.
					let chainLen = 0;
					let ptr = currentStackOffset;
					while (ptr < 256 && vmValue.sharedStackMetadata[ptr] !== 0) {
						chainLen++;
						ptr++;
					}
					if (chainLen % 2 === 0) isPairStart = true;
				} else if (metaNext !== 0) {
					// metaCurrent is 0. It might be a valid LO byte (0x00) if the HI byte starts an odd chain.
					let chainLen = 0;
					let ptr = nextStackOffset;
					while (ptr < 256 && vmValue.sharedStackMetadata[ptr] !== 0) {
						chainLen++;
						ptr++;
					}
					if (chainLen % 2 !== 0) isPairStart = true;
				}

				if (isPairStart) {
					// We have a JSR return address pair.
					current.isReturnAddr = true;
					next.isReturnAddr = true;
					current.isLowByteForReturn = true;

					// Reconstruct target subroutine address from metadata
					const targetAddrPlusOne = (metaNext << 8) | metaCurrent;
					current.subroutineAddr = (targetAddrPlusOne - 1) & 0xffff;

					// Reconstruct JSR site from stack values
					const loRet = current.value;
					const hiRet = next.value;
					const pushedAddr = (hiRet << 8) | loRet;
					current.jsrSite = (pushedAddr - 2) & 0xffff;

					i++; // Skip next byte as it is consumed by this pair
				}
			}
		}

		return slice.reverse(); // Reverse to show higher addresses at the top
	});

	const handleScroll = (event: WheelEvent) => {
		if (event.deltaY < 0) { // Scroll Up (towards lower stack addresses, higher memory values)
			viewCenterOffset.value = Math.max(0, viewCenterOffset.value - 1);
		} else { // Scroll Down (towards higher stack addresses, lower memory values)
			viewCenterOffset.value = Math.min(255, viewCenterOffset.value + 1);
		}
	};

	// This will be our reactive trigger to update the view
	const tick = ref(0);
	onMounted(() => {
		// Subscribe to the UI update loop from App.vue
		subscribeToUiUpdates?.(() => {
			tick.value++;
		});

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

	watch(() => registers.SP, (newSP) => {
		// When the real SP changes, snap the view's center to it.
		viewCenterOffset.value = newSP;
	});

	watch(spElement, (el) => {
		// When the element pointed to by SP changes, scroll it into view.
		el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});

	const handleByteChange = (addr: number, event: InputEvent) => {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value, 16);
		if (!Number.isNaN(value) && value >= 0 && value <= 0xFF)
			vm?.value.writeDebug(addr, value);

	};

</script>
