<template>
	<!-- In a floating panel: no frame nor title, the panel has them -->
	<div
		class="p-2 bg-black rounded-lg shadow-xl flex flex-col h-full in-[.floating-panel]:p-0 in-[.floating-panel]:rounded-none"
	>
		<DebuggerPanelTitle class="in-[.floating-panel]:hidden" title="Stack" />
		<!-- Exactly the rows that fit (ROW_HEIGHT each): no scrollbar, the wheel moves the window over the stack -->
		<div
			ref="list"
			class="font-mono text-xs leading-5 overflow-hidden flex-1 min-h-0 bg-black p-0.5"
			@wheel.prevent="handleScroll"
		>
			<table class="w-full">
				<tbody>
					<tr
						v-for="(item, index) in visibleStackSlice"
						:key="index"
						:class="[
							'h-5 hover:bg-gray-700/50 transition duration-100 border-l-4',
							item.address === stackPointerAddress
								? 'bg-indigo-900/50 text-indigo-100 font-bold border-indigo-400'
								: item.isReturnAddr
									? 'text-emerald-300 border-emerald-500/30 bg-emerald-900/10'
									: 'text-gray-300 border-transparent',
						]"
					>
						<td class="w-[3.25rem] px-1 tabular-nums text-indigo-300">
							{{ addr16(item.address) }}
						</td>
						<td class="p-0 relative">
							<div class="flex items-center">
								<input
									type="text"
									:value="
										isEditing && editingAddress === item.address
											? editingValue
											: toHex(item.value ?? 0)
									"
									@focus="startEdit(item.address, item.value, $event)"
									@blur="cancelEdit"
									@input="handleInput(item.address, $event)"
									@keydown="handleKeyDown($event)"
									maxlength="2"
									class="h-5 w-8 text-center bg-transparent focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums"
								/>
								<!--
									Always there, "$XXXX:JSR $XXXX" wide (15 ch, monospace), empty on the other rows:
									every row is as wide as the widest, the floating panel's width fits it and never jumps
								-->
								<div
									class="flex items-center text-xs text-emerald-400/80 px-2 box-content w-[15ch] whitespace-nowrap tabular-nums shrink-0"
								>
									<template v-if="item.isLowByteForReturn">
										<span
											@click="handleJump(item.jsrSite!)"
											class="cursor-pointer hover:underline"
											:title="`Jump to call site ${formatAddress(item.jsrSite ?? 0)}`"
										>
											{{ addr16(item.jsrSite ?? 0) }}
										</span>
										<span>:JSR&nbsp;</span>
										<span
											@click="handleJump(item.subroutineAddr!)"
											class="cursor-pointer hover:underline"
											:title="`Jump to subroutine ${formatAddress(item.subroutineAddr ?? 0)}`"
										>
											{{ addr16(item.subroutineAddr ?? 0) }}
										</span>
									</template>
								</div>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { useElementSize } from "@vueuse/core";
import { computed, inject, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import DebuggerPanelTitle from "./DebuggerPanelTitle.vue";
import { formatAddress, toHex } from "@/lib/hex.utils";
import { useAddressHistory } from "@/composables/useAddressHistory.ts";

const stackBase = 0x0100;

// Stack and JSR addresses are 16-bit (bank is always 00): drop the bank so a
// return-address row fits the fixed-width column without a horizontal scrollbar.
const addr16 = (addr: number) => `$${toHex(addr, 4)}`;

const vm = inject<Ref<VirtualMachine>>("vm");

interface Props {
	registers: EmulatorRegisters;
}
const { registers } = defineProps<Props>();

/** A row's height (px): the rows are h-5 */
const ROW_HEIGHT = 20;
const list = ref<HTMLElement | null>(null);
const isEditing = ref(false);
const editingAddress = ref<number | null>(null);
const editingValue = ref("");

const { setActiveTab } = useDebuggerNav();
const { jumpToAddress } = useAddressHistory("disassembly");

const handleJump = (address: number) => {
	jumpToAddress(address);
	setActiveTab("disassembly");
};

// The list's content box (padding excluded): as many rows as fit in it, the whole stack at most
const { height: listHeight } = useElementSize(list);
const visibleRowCount = computed(() => Math.min(256, Math.max(1, Math.floor(listHeight.value / ROW_HEIGHT))));

const stackPointerAddress = computed(() => stackBase + registers.SP);

// This ref will hold the center of our view, allowing for independent scrolling.
const viewCenterOffset = ref(registers.SP);

const visibleStackSlice = computed(() => {
	// Access tick to create a reactive dependency on the UI update loop
	// oxlint-disable-next-line no-unused-expressions
	tick.value;

	const currentSP = viewCenterOffset.value ?? 0xff; // This is the SP offset (0-255)

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
	if (endSP > 256) {
		// SP offsets are 0-255, so 256 is one past the end
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
		const current = slice[i]!;
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
	if (event.deltaY < 0) {
		// Scroll Up (towards lower stack addresses, higher memory values)
		viewCenterOffset.value = Math.max(0, viewCenterOffset.value - 1);
	} else {
		// Scroll Down (towards higher stack addresses, lower memory values)
		viewCenterOffset.value = Math.min(255, viewCenterOffset.value + 1);
	}
};

// This will be our reactive trigger to update the view
const tick = ref(0);
let pollInterval: number | undefined;

onMounted(() => {
	pollInterval = window.setInterval(() => {
		if (!isEditing.value) {
			tick.value++;
		}
	}, 250);
});

onUnmounted(() => {
	clearInterval(pollInterval);
});

watch(
	() => registers.SP,
	(newSP) => {
		// When the real SP changes, snap the view's center to it.
		if (!isEditing.value) {
			viewCenterOffset.value = newSP;
		}
	},
);

watch(isEditing, (editing) => {
	if (!editing) {
		viewCenterOffset.value = registers.SP;
		tick.value++;
	}
});

const startEdit = (address: number, value: number, event: FocusEvent) => {
	isEditing.value = true;
	editingAddress.value = address;
	editingValue.value = toHex(value, 2);
	(event.target as HTMLInputElement).select();
};

const cancelEdit = () => {
	isEditing.value = false;
	editingAddress.value = null;
	editingValue.value = "";
};

const commitEdit = (addr: number, val: string, target: HTMLElement | null) => {
	const value = parseInt(val, 16);
	if (!Number.isNaN(value)) {
		vm?.value.writeDebug(addr, value);
	}
	target?.blur();
};

const handleKeyDown = (event: KeyboardEvent) => {
	if (event.key === "Escape") {
		event.preventDefault();
		(event.target as HTMLElement).blur(); // This will trigger cancelEdit
	}
	if (event.key === "Enter") {
		event.preventDefault();
		if (editingAddress.value !== null) {
			commitEdit(editingAddress.value, editingValue.value, event.target as HTMLElement);
		}
	}
	// Filter non-hex keys
	if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
		if (!/^[0-9a-fA-F]$/.test(event.key)) {
			event.preventDefault();
		}
	}
};

const handleInput = (addr: number, event: Event) => {
	const target = event.target as HTMLInputElement;
	editingValue.value = target.value.toUpperCase();

	if (editingValue.value.length === 2) {
		commitEdit(addr, editingValue.value, target);
	}
};
</script>
