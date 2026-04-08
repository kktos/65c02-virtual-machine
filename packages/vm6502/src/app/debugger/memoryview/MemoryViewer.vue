<template>
	<div
		:id="id"
		:class="[
			'p-4 rounded-lg shadow-xl h-full flex flex-col transition-all duration-200',
			isActive ? 'bg-gray-800 ring-1 ring-cyan-500' : 'bg-gray-800/20',
		]"
		ref="scrollContainer"
	>
		<div class="mb-2 mt-1 flex flex-wrap items-center gap-4 shrink-0">
			<div class="flex flex-1 items-center gap-2">
				<AddressNavigator
					name="memory"
					@goto="handleGoto"
					:extra-providers="[memorySearchProvider]"
					:placeholder="placeholder"
					title='Enter address, symbol, start with " for text search (e.g. "HELLO), or hex bytes (e.g. A9 00)'
				/>
				<div class="flex items-center space-x-2 pl-2 border-l border-gray-700">
					<input
						type="checkbox"
						id="live-update"
						v-model="isLive"
						class="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500 h-3 w-3"
					/>
					<label
						for="live-update"
						class="text-xs cursor-pointer select-none text-gray-400 hover:text-gray-200"
						>Live Update</label
					>
				</div>
			</div>

			<BinaryLoader :address="startAddress" :debug-overrides="debugOverrides" />

			<!-- Active Debug Badges -->
			<div v-if="activeDebugBadges.length > 0" class="flex items-center gap-2 ml-auto">
				<div
					v-for="badge in activeDebugBadges"
					:key="badge.id"
					class="flex items-center px-2 py-0.5 rounded bg-cyan-900/40 border border-cyan-700/50 text-[10px] text-cyan-200 font-medium shadow-sm"
				>
					<span class="uppercase tracking-wider">{{ badge.label }}</span>
					<span v-if="badge.value" class="ml-1 text-cyan-100 font-bold">: {{ badge.value }}</span>
				</div>
			</div>

			<!-- Debug Options -->
			<DebugOptionsPopover
				ref="debugOptionsPopover"
				category="memory"
				align="end"
				:class="activeDebugBadges.length > 0 ? '' : 'ml-auto'"
			/>

			<div class="flex items-center space-x-1 ml-2 border-l border-gray-700 pl-2">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6 text-gray-400 hover:text-cyan-300"
					@click="$emit('split', startAddress)"
					title="Split View"
				>
					<Split class="h-4 w-4" />
				</Button>
				<Button
					v-if="canClose"
					variant="ghost"
					size="icon"
					class="h-6 w-6 text-gray-400 hover:text-red-400"
					@click="$emit('close')"
					title="Close View"
				>
					<X class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<div
			class="font-mono text-xs overflow-y-hidden flex-grow min-h-0 bg-gray-900 p-2 rounded-md"
			@wheel="throttledWheelHandler"
			@mouseup="endSelection"
			@mouseleave="endSelection"
		>
			<table class="w-full table-fixed">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md">
						<th class="py-1 text-left w-16">Addr</th>
						<th v-for="i in bytesPerLine" :key="i" class="text-center w-[1.5rem]">
							{{ "+" + (i - 1).toString(16).toUpperCase() }}
						</th>
						<th class="py-1 text-left w-auto pl-4">
							<div class="flex items-center justify-between pr-2">
								<span>ASCII</span>
								<div class="flex items-center space-x-1" title="Set High Bit (bit 7) for ASCII input">
									<input
										type="checkbox"
										id="highBit"
										v-model="highBitEnabled"
										class="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500 h-3 w-3"
									/>
									<label
										for="highBit"
										class="text-[10px] text-gray-400 cursor-pointer select-none font-normal"
										>High Bit</label
									>
								</div>
							</div>
						</th>
					</tr>
				</thead>
				<tbody v-if="visibleRowCount > 0">
					<tr
						v-for="lineIndex in visibleRowCount"
						:key="lineIndex"
						class="hover:bg-gray-700/50 transition duration-100 text-gray-300"
					>
						<td class="py-0.5 text-left text-indigo-300 font-bold font-mono">
							{{ formatAddress(startAddress + (lineIndex - 1) * bytesPerLine) }}
						</td>

						<td v-for="byteIndex in bytesPerLine" :key="byteIndex" class="p-0">
							<MemoryHexLine
								:line-index="lineIndex"
								:line-data="
									currentMemorySlice.subarray(
										(lineIndex - 1) * bytesPerLine,
										lineIndex * bytesPerLine,
									)
								"
								:line-start-address="startAddress + (lineIndex - 1) * bytesPerLine"
								:bytes-per-line="bytesPerLine"
								:byte-offset-in-line="byteIndex - 1"
								:editing-index="editingIndex"
								:editing-mode="editingMode"
								:editing-value="editingValue"
								:selection-anchor="selectionAnchor"
								:selection-head="selectionHead"
								:highlighted-range="highlightedRange"
								:context-menu="contextMenu"
								:debug-overrides="debugOverrides"
								@start-editing="startEditing"
								@start-selection="startSelection"
								@update-selection="updateSelection"
								@contextmenu="handleContextMenu"
								@blur="handleBlur"
								@keydown="handleKeyDown"
								@set-ref="setInputRef"
								@change="(idx, target) => handleHexChange(idx, { target } as any)"
							/>
						</td>

						<td class="py-0.5 pl-4 whitespace-nowrap flex">
							<template v-for="byteIndex in bytesPerLine" :key="byteIndex">
								<MemoryAsciiLine
									:line-index="lineIndex"
									:line-data="
										currentMemorySlice.subarray(
											(lineIndex - 1) * bytesPerLine,
											lineIndex * bytesPerLine,
										)
									"
									:line-start-address="startAddress + (lineIndex - 1) * bytesPerLine"
									:bytes-per-line="bytesPerLine"
									:byte-offset-in-line="byteIndex - 1"
									:editing-index="editingIndex"
									:editing-mode="editingMode"
									:editing-value="editingValue"
									:selection-anchor="selectionAnchor"
									:selection-head="selectionHead"
									:highlighted-range="highlightedRange"
									:high-bit-enabled="highBitEnabled"
									:debug-overrides="debugOverrides"
									@start-editing="startEditing"
									@start-selection="startSelection"
									@update-selection="updateSelection"
									@blur="handleBlur"
									@keydown="handleKeyDown"
									@set-ref="setInputRef"
									@change="(idx, target) => handleAsciiChange(idx, { target } as any)"
								/>
							</template>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Selection Status Bar -->
		<MemorySelectionStatus
			:selected-range="selectedRange"
			@format="formatAs"
			@cancel-selection="cancelSelection"
			class="shrink-0"
		/>

		<Popover
			:open="contextMenu.isOpen"
			@update:open="(val) => (contextMenu.isOpen = val)"
			:key="`${contextMenu.x}-${contextMenu.y}`"
		>
			<PopoverTrigger as-child>
				<div
					class="fixed w-0 h-0 invisible"
					:style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
				></div>
			</PopoverTrigger>
			<PopoverContent
				class="w-48 p-1 bg-gray-800 border-gray-700 text-gray-200 text-xs"
				align="start"
				side="bottom"
				:side-offset="10"
			>
				<div class="px-2 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-700 mb-1">
					Address: {{ formatAddress(contextMenu.address) }}
				</div>
				<button
					@click="disassembleHere"
					class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center"
				>
					Disassemble Here
				</button>
				<button
					@click="openAddSymbol"
					class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center"
				>
					Add/Edit Label
				</button>
				<button
					@click="addBp('read')"
					class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center"
				>
					Break on Read
				</button>
				<button
					@click="addBp('write')"
					class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center"
				>
					Break on Write
				</button>
				<button
					@click="addBp('access')"
					class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center"
				>
					Break on Access
				</button>
			</PopoverContent>
		</Popover>

		<AddSymbolPopover
			:is-open="symbolPopover.isOpen"
			@update:is-open="(val) => (symbolPopover.isOpen = val)"
			:x="symbolPopover.x"
			:y="symbolPopover.y"
			:address="symbolPopover.address"
			:initial-length="symbolPopover.initialLength"
		/>
	</div>
</template>

<script lang="ts" setup>
import { Split, X } from "lucide-vue-next";
import { computed, inject, nextTick, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import MemoryAsciiLine from "./MemoryAsciiLine.vue";
import MemoryHexLine from "./MemoryHexLine.vue";
import AddressNavigator from "@/app/debugger/AddressNavigator.vue";
import AddSymbolPopover from "@/components/AddSymbolPopover.vue";
import DebugOptionsPopover from "@/components/DebugOptionsPopover.vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SearchProvider, SearchSuggestion } from "@/composables/useSymbols";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useDisassembly } from "@/composables/useDisassembly";
import { useFormatting } from "@/composables/useDataFormattings";
import { onKeyStroke, useThrottleFn } from "@vueuse/core";
import { formatAddress } from "@/lib/hex.utils";
import type { DebugGroup } from "@/types/machine.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import BinaryLoader from "./BinaryLoader.vue";
import { useMachine } from "@/composables/useMachine";
import MemorySelectionStatus from "./MemorySelectionStatus.vue";

const vm = inject<Ref<VirtualMachine>>("vm");
const { addFormatting } = useFormatting();
const { isRunning } = useMachine();

const props = defineProps<{
	id?: string;
	canClose?: boolean;
	initialAddress?: number;
	listenToNav?: boolean;
	isActive?: boolean;
}>();

const emit = defineEmits<{
	(e: "split", address: number): void;
	(e: "close"): void;
	(e: "update:address", address: number): void;
}>();

const placeholder = ref(`addr, symbol, "|'text, bytes`);
const banks = vm?.value.machineConfig.memory.banks || 1;
const totalMemory = banks * 0x10000;
const bytesPerLine = ref(16);
const startAddress = ref<number>(props.initialAddress ?? 0x0000);

const scrollContainer = ref<HTMLElement | null>(null);
const containerHeight = ref(0);
const ROW_HEIGHT_ESTIMATE = 22; // Estimated height of a row in pixels
let resizeObserver: ResizeObserver | null = null;

const { memoryViewAddress, setActiveTab } = useDebuggerNav();
const { requestJump } = useDisassembly();

const visibleRowCount = computed(() => {
	if (containerHeight.value === 0) return 10; // Default before mounted
	return Math.max(1, Math.floor(containerHeight.value / ROW_HEIGHT_ESTIMATE));
});
const debugOptionsPopover = ref<InstanceType<typeof DebugOptionsPopover> | null>(null);
const debugOverrides = computed(() => debugOptionsPopover.value?.debugOverrides || {});

const isLive = ref(false);
let pollInterval: number | undefined;

const currentMemorySlice = ref<Uint8Array>(new Uint8Array());
const refreshMemory = () => {
	const start = startAddress.value;
	const length = visibleRowCount.value * bytesPerLine.value;

	if (vm?.value) currentMemorySlice.value = vm.value.readDebugRange(start, length, debugOverrides.value);
	else currentMemorySlice.value = new Uint8Array(length);
};

watch(
	() => props.initialAddress,
	(newAddress) => {
		if (newAddress !== null && newAddress !== undefined) startAddress.value = newAddress;
		// if ((props.listenToNav ?? true) && newAddress !== null) startAddress.value = newAddress;
	},
);

watch(memoryViewAddress, (newAddress) => {
	if ((props.listenToNav ?? true) && newAddress !== null) startAddress.value = newAddress;
});

watch(startAddress, (newAddr) => {
	emit("update:address", newAddr);
});

watch(isLive, (active) => {
	clearInterval(pollInterval);
	if (active) {
		refreshMemory();
		pollInterval = window.setInterval(refreshMemory, 250); // 4 FPS
	}
});

// Watch for changes in startAddress or the tick, and update the slice
watch(
	[startAddress, visibleRowCount, debugOverrides, isRunning, bytesPerLine],
	() => {
		if (!isLive.value) refreshMemory();
	},
	{ immediate: true, deep: true },
);

const highBitEnabled = ref(false);

const memorySearchProvider: SearchProvider = (query) => {
	if (!vm?.value) return [];

	const q = query.trim();
	if (q.length < 2) return [];

	let targetBytes: number[] = [];
	let label = "";
	let is7bit = false;

	// 1. String Search: "foo
	if (q.startsWith("'")) {
		const text = q.slice(1);
		if (text.length === 0) return [];
		for (let i = 0; i < text.length; i++) targetBytes.push(text.charCodeAt(i));
		label = `'${text}'`;
	} else if (q.startsWith('"')) {
		const text = q.slice(1);
		if (text.length === 0) return [];
		for (let i = 0; i < text.length; i++) targetBytes.push(text.charCodeAt(i) | 0x80);
		label = `"${text}"`;
	} else if (q.startsWith("*")) {
		const text = q.slice(1);
		if (text.length === 0) return [];
		for (let i = 0; i < text.length; i++) targetBytes.push(text.charCodeAt(i));
		is7bit = true;
		label = `"${text}"`;
	} else {
		// 2. Hex Search: A9 00
		const hex = q.replace(/^(\$|0x)/i, "").replace(/\s/g, "");
		// Must be valid hex and full bytes (even length)
		if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length % 2 !== 0) return [];
		for (let i = 0; i < hex.length; i += 2) targetBytes.push(parseInt(hex.slice(i, i + 2), 16));
		label = `Bytes ${q}`;
	}

	if (targetBytes.length === 0) return [];

	// Use the VM's search method for efficiency and to handle memory banking correctly.
	const searchResults = vm.value.search(targetBytes, 0, totalMemory - 1, is7bit);

	if (!searchResults) return [];

	const MAX_RESULTS = 20;
	const results: SearchSuggestion[] = searchResults.slice(0, MAX_RESULTS).map((found) => ({
		label: `${label}`,
		addr: found.address,
		value: q,
		scope: "MEM",
	}));

	return results;
};

const handleGoto = (addr: number) => {
	if (addr < totalMemory) startAddress.value = addr;
};

const highlightedRange = ref<{ start: number; length: number } | null>(null);

// --- Context Menu ---
const contextMenu = ref({
	isOpen: false,
	x: 0,
	y: 0,
	address: 0,
});

const handleContextMenu = (index: number, event: MouseEvent) => {
	contextMenu.value = {
		isOpen: true,
		x: event.clientX,
		y: event.clientY,
		address: startAddress.value + index,
	};
};

const closeContextMenu = () => {
	contextMenu.value.isOpen = false;
};

const symbolPopover = ref({
	isOpen: false,
	x: 0,
	y: 0,
	address: 0,
	initialLength: 1,
});

const openAddSymbol = () => {
	const range = selectedRange.value;
	const contextAddr = contextMenu.value.address;

	let symbolAddr = contextAddr;
	let symbolSize = 1;

	// Check if a multi-cell range is selected and the context click was inside it
	if (range && range.size > 1 && contextAddr >= range.start && contextAddr <= range.end) {
		symbolAddr = range.start;
		symbolSize = range.size;
	}

	symbolPopover.value = {
		isOpen: true,
		x: contextMenu.value.x,
		y: contextMenu.value.y,
		address: symbolAddr,
		initialLength: symbolSize,
	};
	closeContextMenu();
};

const disassembleHere = () => {
	requestJump(contextMenu.value.address);
	setActiveTab("disassembly");
	closeContextMenu();
};

const { addBreakpoint } = useBreakpoints();

const addBp = (type: "read" | "write" | "access") => {
	if (!vm?.value) return;
	const addr = contextMenu.value.address;
	addBreakpoint({ type, address: addr }, vm.value);
	closeContextMenu();
};

const activeDebugBadges = computed(() => {
	if (!debugOptionsPopover.value || !vm?.value) return [];

	const options = (debugOptionsPopover.value.debugOptions as DebugGroup[]) || [];
	const overrides = (debugOptionsPopover.value.debugOverrides as Record<string, unknown>) || {};
	const badges: { id: string; label: string; value?: string }[] = [];

	for (const group of options) {
		for (const row of group.rows) {
			for (const opt of row) {
				const val = overrides[opt.id];

				// Determine default value
				let defaultVal = opt.defaultValue;
				if (defaultVal === undefined) {
					if (opt.type === "select" && opt.options?.length) {
						defaultVal = opt.options[0]?.value;
					} else if (opt.type === "boolean") {
						defaultVal = false;
					}
				}

				if (val !== undefined && val !== defaultVal) {
					if (opt.type === "boolean") {
						if (val === true) {
							badges.push({ id: opt.id, label: opt.label });
						}
					} else if (opt.type === "select") {
						const selectedOption = opt.options?.find((o) => o.value === val);
						const displayValue = selectedOption ? selectedOption.label : String(val);
						badges.push({ id: opt.id, label: opt.label, value: displayValue });
					} else if (opt.type === "number") {
						badges.push({ id: opt.id, label: opt.label, value: String(val) });
					}
				}
			}
		}
	}
	return badges;
});

onKeyStroke("Escape", (e) => {
	if (!props.isActive) return;
	if (editingIndex.value === null && selectedRange.value) {
		cancelSelection();
		e.preventDefault();
	}
});

onMounted(() => {
	if (scrollContainer.value) {
		// Set initial height and observe for changes
		resizeObserver = new ResizeObserver((entries) => {
			if (entries[0]) {
				const { width, height } = entries[0].contentRect;
				containerHeight.value = height;

				// Calculate columns: Addr(64) + Padding(~36) + Scroll(~20) = ~120px overhead
				// Cell Width = Hex(24) + Ascii(~12) = ~36px per byte
				const availableWidth = width - 20;
				bytesPerLine.value = Math.floor(availableWidth / 36);
				// const snapped = Math.max(4, Math.floor(possibleBytes / 4) * 4); // Snap to 4
				// const snapped = Math.max(1, Math.floor(possibleBytes / 1) * 1); // Snap to 1
				// if (bytesPerLine.value !== snapped) bytesPerLine.value = snapped;
			}
		});
		resizeObserver.observe(scrollContainer.value);
	}
});

onUnmounted(() => {
	resizeObserver?.disconnect();
	clearInterval(pollInterval);
});

// --- Selection Logic ---
const selectionAnchor = ref<number | null>(null);
const selectionHead = ref<number | null>(null);
const isSelecting = ref(false);

const selectedRange = computed(() => {
	if (editingIndex.value !== null) return null;
	if (selectionAnchor.value === null || selectionHead.value === null) return null;
	const start = Math.min(selectionAnchor.value, selectionHead.value);
	const end = Math.max(selectionAnchor.value, selectionHead.value);
	return { start, end, size: end - start + 1 };
});

const startSelection = (index: number, event: MouseEvent) => {
	if (event.button !== 0) return; // Left click only
	const addr = startAddress.value + index;

	if (editingIndex.value !== null) handleBlur();

	isSelecting.value = true;
	if (event.shiftKey && selectionAnchor.value !== null) {
		selectionHead.value = addr;
	} else {
		selectionAnchor.value = addr;
		selectionHead.value = addr;
	}
};

const updateSelection = (index: number) => {
	if (isSelecting.value) {
		selectionHead.value = startAddress.value + index;
	}
};

const endSelection = () => {
	isSelecting.value = false;
};

const cancelSelection = () => {
	selectionAnchor.value = null;
	selectionHead.value = null;
};

const formatAs = (type: "byte" | "string") => {
	if (!selectedRange.value) return;
	addFormatting(selectedRange.value.start, type, selectedRange.value.size);
	cancelSelection();
};

const editingIndex = ref<number | null>(null);
const editingMode = ref<"hex" | "ascii" | null>(null);
const editingValue = ref("");
const activeInputRef = ref<HTMLInputElement | null>(null);

const setInputRef = (el: unknown, index: number) => {
	if (el && index === editingIndex.value) {
		activeInputRef.value = el as HTMLInputElement;
	}
};

const handleBlur = (index?: number) => {
	// If the blur event comes from a cell that is no longer being edited (because we moved to another one), ignore it.
	if (typeof index === "number" && editingIndex.value !== index) return;
	editingIndex.value = null;
	editingMode.value = null;
};

const getAsciiChar = (byte: number | undefined) => {
	if (byte === undefined) return "·";
	const val = byte & 0x7f;
	if (val >= 32 && val <= 126) return String.fromCharCode(val);
	return "·";
};

const startEditing = async (index: number, mode: "hex" | "ascii") => {
	if (editingIndex.value === index && editingMode.value === mode) return;

	selectionAnchor.value = null;
	selectionHead.value = null;

	editingIndex.value = index;
	editingMode.value = mode;

	if (mode === "hex") {
		const byte = currentMemorySlice.value[index];
		editingValue.value = byte?.toString(16).toUpperCase().padStart(2, "0") ?? "";
	} else {
		editingValue.value = getAsciiChar(currentMemorySlice.value[index]);
	}

	await nextTick();

	if (activeInputRef.value) {
		activeInputRef.value.focus();
		activeInputRef.value.select();
	}
};

const handleKeyDown = (index: number, event: KeyboardEvent, mode: "hex" | "ascii") => {
	let direction = 0;

	switch (event.key) {
		case "ArrowUp":
			direction = -bytesPerLine.value;
			break;
		case "ArrowDown":
			direction = bytesPerLine.value;
			break;
		case "ArrowLeft":
			direction = -1;
			break;
		case "Enter":
		case "ArrowRight":
			direction = 1;
			break;
		case "Escape":
			(event.target as HTMLElement).blur();
			cancelSelection();
			return;
		default: {
			if (mode !== "hex") return;
			if (event.key === " ") {
				direction = 1;
				break;
			}
			if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
				if (!/^[0-9a-fA-F]$/.test(event.key)) event.preventDefault();
			}
			return;
		}
	}

	event.preventDefault();

	const targetAbs = startAddress.value + index + direction;

	if (targetAbs < 0 || targetAbs > 0xffffff) return;

	const visibleBytes = visibleRowCount.value * bytesPerLine.value;
	const endAddress = startAddress.value + visibleBytes;

	if (targetAbs >= startAddress.value && targetAbs < endAddress) {
		const targetIndex = targetAbs - startAddress.value;
		startEditing(targetIndex, mode);
	} else {
		if (targetAbs < startAddress.value) {
			startAddress.value = Math.max(0, startAddress.value - bytesPerLine.value);
		} else {
			startAddress.value = Math.min(0xffffff, startAddress.value + bytesPerLine.value);
		}

		nextTick(() => {
			const newTargetIndex = targetAbs - startAddress.value;
			if (newTargetIndex >= 0 && newTargetIndex < visibleBytes) startEditing(newTargetIndex, mode);
		});
	}
};

const handleHexChange = (index: number, event: Event) => {
	const target = event.target as HTMLInputElement;
	if (editingIndex.value === index && editingMode.value === "hex") editingValue.value = target.value;
	const value = parseInt(target.value, 16);
	if (!Number.isNaN(value) && value >= 0 && value <= 0xff && debugOverrides.value) {
		vm?.value.writeDebug(startAddress.value + index, value, debugOverrides.value);
		if (!isLive.value) refreshMemory();
	}

	if (target.value.length === 2) {
		const nextIndex = index + 1;
		const visibleBytes = visibleRowCount.value * bytesPerLine.value;
		if (nextIndex < visibleBytes) {
			startEditing(nextIndex, "hex");
		} else {
			(event.target as HTMLElement).blur();
		}
	}
};

const handleAsciiChange = (index: number, event: Event) => {
	const target = event.target as HTMLInputElement;
	if (editingIndex.value === index && editingMode.value === "ascii") editingValue.value = target.value;
	const val = target.value;
	if (val.length > 0) {
		let code = val.charCodeAt(0);
		if (highBitEnabled.value) code |= 0x80;
		if (debugOverrides.value) {
			vm?.value.writeDebug(startAddress.value + index, code, debugOverrides.value);
			if (!isLive.value) refreshMemory();
		}
		const nextIndex = index + 1;
		const visibleBytes = visibleRowCount.value * bytesPerLine.value;
		if (nextIndex < visibleBytes) {
			startEditing(nextIndex, "ascii");
		} else {
			(event.target as HTMLElement).blur();
		}
	}
};

const throttledWheelHandler = useThrottleFn((event: WheelEvent) => {
	event.preventDefault();
	const scrollAmount = bytesPerLine.value * (event.ctrlKey ? visibleRowCount.value : 1);

	if (event.deltaY > 0) {
		// Scrolling down -> increase address
		const newAddress = startAddress.value + scrollAmount;
		startAddress.value = Math.min(newAddress, 0xffffff - visibleRowCount.value * bytesPerLine.value + 1);
	} else if (event.deltaY < 0) {
		// Scrolling up -> decrease address
		const newAddress = startAddress.value - scrollAmount;
		startAddress.value = Math.max(newAddress, 0);
	}
}, 16); // Throttle to ~60fps to prevent jank on high-precision scroll wheels
</script>
