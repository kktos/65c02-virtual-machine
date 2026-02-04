<template>
	<div :class="['p-4 rounded-lg shadow-xl h-full flex flex-col transition-all duration-200', isActive ? 'bg-gray-800 ring-1 ring-cyan-500' : 'bg-gray-800/20']" ref="scrollContainer">
		<div class="mb-3 mt-1 flex flex-wrap items-center gap-4 shrink-0">
			<div class="flex items-center space-x-2">
				<span class="text-gray-300 text-sm">Addr:</span>
				<div class="flex items-center">
					<Popover v-model:open="openBankSelect">
						<PopoverTrigger as-child>
							<Button
								variant="outline"
								role="combobox"
								:aria-expanded="openBankSelect"
								class="w-16 justify-between px-2 font-mono text-sm bg-gray-700 text-yellow-300 border-gray-600 hover:bg-gray-600 hover:text-yellow-300 h-[30px] rounded-l-md rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								{{ currentBank.toString(16).toUpperCase().padStart(2, '0') }}
								<ChevronsUpDown class="ml-1 h-3 w-3 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent class="w-32 p-0 bg-gray-800 border-gray-700">
							<Command class="bg-gray-800 text-gray-100">
								<CommandInput class="h-8 text-xs" placeholder="Bank..." />
								<CommandEmpty class="py-2 text-center text-xs text-gray-500">No bank.</CommandEmpty>
								<CommandList>
									<CommandGroup>
										<CommandItem v-for="bank in availableBanks" :key="bank.value" :value="bank.label" @select="selectBank(bank.value)" class="text-xs font-mono data-[highlighted]:bg-gray-700 data-[highlighted]:text-yellow-300 cursor-pointer text-white">
											<Check :class="['mr-2 h-3 w-3', currentBank === bank.value ? 'opacity-100' : 'opacity-0']" />
											{{ bank.label }}
										</CommandItem>
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
					<span class="bg-gray-700 text-gray-400 font-mono text-sm py-1 border-y border-gray-600">:</span>
					<input
						type="text"
						:value="(startAddress & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')"
						@input="handleOffsetChange"
						class="bg-gray-700 text-yellow-300 font-mono text-sm rounded-r-md px-2 py-1 w-16 border-y border-r border-gray-600 focus:ring-2 focus:ring-cyan-500 tabular-nums outline-none"
					/>
				</div>

				<BinaryLoader :address="startAddress" :debug-overrides="debugOverrides" />

			</div>

			<!-- Search Popover -->
			<Popover v-model:open="isSearchOpen">
				<PopoverTrigger as-child>
					<Button variant="ghost" size="icon" class="h-6 w-6 text-gray-400 hover:text-cyan-300" title="Search Memory">
						<Search class="h-4 w-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent class="w-80 p-3 bg-gray-800 border-gray-700" align="end">
					<div class="flex flex-col space-y-3">
						<div class="flex items-center space-x-2">
							<select v-model="searchMode" class="bg-gray-900 text-xs text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-cyan-500">
								<option value="hex">Hex</option>
								<option value="text_lo">Text (bit7=0)</option>
								<option value="text_hi">Text (bit7=1)</option>
								<option value="text_any">Text (Any)</option>
							</select>
							<input v-model="searchQuery" @keydown.enter="performSearch(1)" type="text" class="flex-1 bg-gray-900 text-xs text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-cyan-500" :placeholder="searchMode === 'hex' ? 'e.g. A9 00' : 'Text...'" />
						</div>
						<div class="flex items-center space-x-2">
							<input type="checkbox" id="searchAllBanks" v-model="searchAllBanks" class="rounded bg-gray-900 border-gray-600 text-cyan-500 focus:ring-cyan-500 h-3 w-3" />
							<label for="searchAllBanks" class="text-xs text-gray-300 cursor-pointer select-none">Search All Banks</label>
						</div>
						<div v-if="searchError" class="text-[10px] text-red-400">{{ searchError }}</div>
						<div class="flex justify-end space-x-2">
							<Button size="sm" variant="secondary" class="h-7 text-xs" @click="performSearch(-1)">Prev</Button>
							<Button size="sm" class="h-7 text-xs bg-cyan-600 hover:bg-cyan-500 text-white" @click="performSearch(1)">Next</Button>
						</div>
					</div>
				</PopoverContent>
			</Popover>

			<!-- Debug Options -->
			<DebugOptionsPopover ref="debugOptionsPopover" category="memory" align="end" class="ml-auto" />

			<div class="flex items-center space-x-1 ml-2 border-l border-gray-700 pl-2">
				<Button variant="ghost" size="icon" class="h-6 w-6 text-gray-400 hover:text-cyan-300" @click="$emit('split', startAddress)" title="Split View">
					<Split class="h-4 w-4" />
				</Button>
				<Button v-if="canClose" variant="ghost" size="icon" class="h-6 w-6 text-gray-400 hover:text-red-400" @click="$emit('close')" title="Close View">
					<X class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<div
			class="font-mono text-xs overflow-y-hidden flex-grow min-h-0 bg-gray-900 p-2 rounded-md"
			@wheel="handleWheel"
		>
			<table class="w-full table-fixed">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md">
						<th class="py-1 text-left w-16">Addr</th>
						<th v-for="i in BYTES_PER_LINE" :key="i" class="text-center w-[1.5rem]">{{ '+' + (i - 1).toString(16).toUpperCase() }}</th>
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
									<label for="highBit" class="text-[10px] text-gray-400 cursor-pointer select-none font-normal">High Bit</label>
								</div>
							</div>
						</th>
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
								:value="editingIndex === ((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)) && editingMode === 'hex' ? editingValue : currentMemorySlice[(lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)]?.toString(16).toUpperCase().padStart(2, '0')"
								:ref="(el) => setHexInputRef(el, (lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1))"
								@keydown="handleKeyDown((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event, 'hex')"
								@contextmenu.prevent="handleContextMenu((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event)"
								@input="handleHexChange((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event)"
								@focus="handleHexFocus((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event)"
								@blur="handleBlur"
								maxlength="2"
								:class="['w-full text-center focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums text-xs', isHighlighted((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)) ? 'bg-yellow-600/50 text-white font-bold' : 'bg-transparent', getBreakpointClass((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1))]"
							/>
						</td>

						<td class="py-0.5 pl-4 whitespace-nowrap flex">
							<input
								v-for="byteIndex in BYTES_PER_LINE"
								:key="byteIndex"
								type="text"
								:value="getAsciiChar(currentMemorySlice[(lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)])"
								:ref="(el) => setAsciiInputRef(el, (lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1))"
								@keydown="handleKeyDown((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event, 'ascii')"
								@input="handleAsciiChange((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event)"
								@focus="handleAsciiFocus((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1), $event)"
								@blur="handleBlur"
								maxlength="1"
								:class="['w-[1.2ch] text-center focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums text-xs p-0 border-none font-bold', getAsciiClass(currentMemorySlice[(lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)], isHighlighted((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1))), getBreakpointClass((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1))]"
							/>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div v-if="contextMenu.isOpen" class="fixed z-50 w-48 rounded-md border border-gray-700 bg-gray-800 p-1 shadow-md text-gray-200 text-xs" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }" @click.stop>
			<div class="px-2 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-700 mb-1">
				Address: {{ formatAddress(contextMenu.address) }}
			</div>
			<button @click="addBp('read')" class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center">
				Break on Read
			</button>
			<button @click="addBp('write')" class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center">
				Break on Write
			</button>
			<button @click="addBp('access')" class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center">
				Break on Access
			</button>
		</div>
	</div>
</template>

<script lang="ts" setup>
	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

	import { Check, ChevronsUpDown, Search, Split, X } from "lucide-vue-next";
import { computed, inject, nextTick, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import DebugOptionsPopover from "@/components/DebugOptionsPopover.vue";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import BinaryLoader from "./BinaryLoader.vue";

	const vm= inject<Ref<VirtualMachine>>("vm");
	const subscribeToUiUpdates= inject<(callback: () => void) => void>("subscribeToUiUpdates");

	const props = defineProps<{
		canClose?: boolean;
		initialAddress?: number;
		listenToNav?: boolean;
		isActive?: boolean;
	}>();

	const emit = defineEmits<{
		(e: 'split', address: number): void;
		(e: 'close'): void;
		(e: 'update:address', address: number): void;
	}>();

	const startAddress = ref(props.initialAddress ?? 0x0000);
	const BYTES_PER_LINE = 16;

	const scrollContainer = ref<HTMLElement | null>(null);
	const containerHeight = ref(0);
	const ROW_HEIGHT_ESTIMATE = 22; // Estimated height of a row in pixels
	let resizeObserver: ResizeObserver | null = null;

	const { memoryViewAddress } = useDebuggerNav();
	watch(memoryViewAddress, (newAddress) => {
		if ((props.listenToNav ?? true) && newAddress !== null) startAddress.value = newAddress;
	});

	watch(startAddress, (newAddr) => {
		emit('update:address', newAddr);
	});

	const visibleRowCount = computed(() => {
		if (containerHeight.value === 0) return 10; // Default before mounted
		return Math.max(1, Math.floor(containerHeight.value / ROW_HEIGHT_ESTIMATE));
	});

	const openBankSelect = ref(false);

	const highBitEnabled = ref(false);

	const availableBanks = computed(() => {
		const banks = vm?.value?.machineConfig?.memory?.banks || 1;
		return Array.from({ length: banks }, (_, i) => ({
			value: i,
			label: i.toString(16).toUpperCase().padStart(2, "0"),
		}));
	});

	const currentBank = computed(() => (startAddress.value >> 16) & 0xff);

	const selectBank = (bankValue: number) => {
		startAddress.value = (startAddress.value & 0xffff) | (bankValue << 16);
		openBankSelect.value = false;
	};

	// --- Search Functionality ---
	const isSearchOpen = ref(false);
	const searchQuery = ref("");
	const searchMode = ref<'hex' | 'text_lo' | 'text_hi' | 'text_any'>('hex');
	const searchAllBanks = ref(false);
	const searchError = ref("");
	const highlightedRange = ref<{ start: number, length: number } | null>(null);

	const isHighlighted = (index: number) => {
		if (!highlightedRange.value) return false;
		const addr = startAddress.value + index;
		return addr >= highlightedRange.value.start && addr < highlightedRange.value.start + highlightedRange.value.length;
	};

	const performSearch = (direction: 1 | -1) => {
		searchError.value = "";
		highlightedRange.value = null;
		if (!searchQuery.value || !vm?.value) return;

		let searchBytes: number[] = [];

		if (searchMode.value === 'hex') {
			const clean = searchQuery.value.replace(/\s+/g, '');
			if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
				searchError.value = "Invalid Hex";
				return;
			}
			for (let i = 0; i < clean.length; i += 2) {
				searchBytes.push(parseInt(clean.substring(i, i + 2), 16));
			}
		} else {
			for (let i = 0; i < searchQuery.value.length; i++) {
				const charCode = searchQuery.value.charCodeAt(i) & 0x7F;
				if (searchMode.value === 'text_hi') {
					searchBytes.push(charCode | 0x80);
				} else {
					searchBytes.push(charCode);
				}
			}
		}

		if (searchBytes.length === 0) return;

		const bankBase = startAddress.value & 0xFF0000;
		const currentOffset = startAddress.value & 0xFFFF;
		const banks = vm.value.machineConfig.memory.banks || 1;
		const totalMemory = banks * 0x10000;
		const maxSearch = searchAllBanks.value ? totalMemory : 0x10000;

		let foundAddr = -1;

		for (let i = 1; i < maxSearch; i++) {
			let checkAddr = 0;

			if (searchAllBanks.value) {
				let rawAddr = startAddress.value + (direction * i);
				while (rawAddr < 0) rawAddr += totalMemory;
				while (rawAddr >= totalMemory) rawAddr -= totalMemory;
				checkAddr = rawAddr;
			} else {
				const offsetToCheck = direction === 1 ? (currentOffset + i) & 0xFFFF : (currentOffset - i) & 0xFFFF;
				checkAddr = bankBase | offsetToCheck;
			}

			let match = true;
			for (let j = 0; j < searchBytes.length; j++) {
				let addrToRead = 0;
				if (searchAllBanks.value) {
					addrToRead = (checkAddr + j) % totalMemory;
				} else {
					addrToRead = bankBase | ((checkAddr + j) & 0xFFFF);
				}

				let val = vm.value.readDebug(addrToRead, debugOverrides.value);

				if (searchMode.value === 'text_any') {
					val &= 0x7F;
				}

				if (val !== searchBytes[j]) {
					match = false;
					break;
				}
			}

			if (match) {
				foundAddr = checkAddr;
				break;
			}
		}

		if (foundAddr !== -1) {
			highlightedRange.value = { start: foundAddr, length: searchBytes.length };
			// Center the found address in the view and align to row boundary
			const foundRowStart = foundAddr & 0xFFFFFFF0;
			const rowsBefore = Math.floor(visibleRowCount.value / 2);
			let newStart = foundRowStart - (rowsBefore * BYTES_PER_LINE);
			if (newStart < 0) newStart = 0;
			startAddress.value = newStart;
		}
		else searchError.value = searchAllBanks.value ? "Not found in memory" : "Not found in current bank";
	};

	// --- Context Menu ---
	const contextMenu = ref({
		isOpen: false,
		x: 0,
		y: 0,
		address: 0
	});

	const handleContextMenu = (index: number, event: MouseEvent) => {
		contextMenu.value = {
			isOpen: true,
			x: event.clientX,
			y: event.clientY,
			address: startAddress.value + index
		};
	};

	const closeContextMenu = () => {
		contextMenu.value.isOpen = false;
	};

	const { addBreakpoint, breakpoints } = useBreakpoints();

	const addBp = (type: 'read' | 'write' | 'access') => {
		if (!vm?.value) return;
		const addr = contextMenu.value.address;
		addBreakpoint({ type, address: addr }, vm.value);
		closeContextMenu();
	};

	const getBreakpointClass = (index: number) => {
		const addr = startAddress.value + index;
		const bps = breakpoints.value.filter(b => b.enabled && b.address === addr);
		if (bps.length === 0) return '';

		if (bps.some(b => b.type === 'access')) return 'ring-2 ring-inset ring-green-500/80';
		if (bps.some(b => b.type === 'write')) return 'ring-2 ring-inset ring-red-500/80';
		if (bps.some(b => b.type === 'read')) return 'ring-2 ring-inset ring-yellow-500/80';
		if (bps.some(b => b.type === 'pc')) return 'ring-2 ring-inset ring-indigo-500/80';
		return '';
	};

	// This will be our reactive trigger to update the view
	const tick = ref(0);

	const debugOptionsPopover = ref<InstanceType<typeof DebugOptionsPopover> | null>(null);
	const debugOverrides = computed(() => debugOptionsPopover.value?.debugOverrides || {});

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

		document.addEventListener('click', closeContextMenu);
	});

	onUnmounted(() => { resizeObserver?.disconnect(); document.removeEventListener('click', closeContextMenu); });

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
	const editingMode = ref<'hex' | 'ascii' | null>(null);
	const editingValue = ref("");
	const hexInputRefs = ref<Map<number, HTMLInputElement>>(new Map());
	const asciiInputRefs = ref<Map<number, HTMLInputElement>>(new Map());

	const setHexInputRef = (el: unknown, index: number) => {
		if (el) {
			hexInputRefs.value.set(index, el as HTMLInputElement);
		} else {
			hexInputRefs.value.delete(index);
		}
	};

	const setAsciiInputRef = (el: unknown, index: number) => {
		if (el) {
			asciiInputRefs.value.set(index, el as HTMLInputElement);
		} else {
			asciiInputRefs.value.delete(index);
		}
	};

	const handleHexFocus = (index: number, event: FocusEvent) => {
		editingIndex.value = index;
		editingMode.value = 'hex';
		const target = event.target as HTMLInputElement;
		editingValue.value = target.value;
		target.select();
	};

	const handleAsciiFocus = (index: number, event: FocusEvent) => {
		editingIndex.value = index;
		editingMode.value = 'ascii';
		const target = event.target as HTMLInputElement;
		target.select();
	};

	const handleBlur = () => {
		editingIndex.value = null;
		editingMode.value = null;
	};

	const handleKeyDown = (index: number, event: KeyboardEvent, mode: 'hex' | 'ascii') => {
		let direction = 0;
		if (event.key === "ArrowUp") direction = -BYTES_PER_LINE;
		else if (event.key === "ArrowDown") direction = BYTES_PER_LINE;
		else if (event.key === "ArrowLeft") direction = -1;
		else if (event.key === "ArrowRight") direction = 1;
		else if (event.key === " " && mode === 'hex') direction = 1;
		else if (event.key === "Enter") direction = 1;
		else if (event.key === "Escape") return (event.target as HTMLElement).blur();
		else {
			if (mode === 'hex' && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
				if (!/^[0-9a-fA-F]$/.test(event.key)) event.preventDefault();
			}
			return;
		}

		event.preventDefault();

		const targetAbs = startAddress.value + index + direction;

		if (targetAbs < 0 || targetAbs > 0xFFFFFF) return;

		const visibleBytes = visibleRowCount.value * BYTES_PER_LINE;
		const endAddress = startAddress.value + visibleBytes;

		if (targetAbs >= startAddress.value && targetAbs < endAddress) {
			const targetIndex = targetAbs - startAddress.value;
			const refs = mode === 'hex' ? hexInputRefs.value : asciiInputRefs.value;
			refs.get(targetIndex)?.focus();
		} else {
			if (targetAbs < startAddress.value) {
				startAddress.value = Math.max(0, startAddress.value - BYTES_PER_LINE);
			} else {
				startAddress.value = Math.min(0xFFFFFF, startAddress.value + BYTES_PER_LINE);
			}

			nextTick(() => {
				const newTargetIndex = targetAbs - startAddress.value;
				if (newTargetIndex >= 0 && newTargetIndex < visibleBytes) {
					const refs = mode === 'hex' ? hexInputRefs.value : asciiInputRefs.value;
					refs.get(newTargetIndex)?.focus();
				}
			});
		}
	};

	const handleHexChange = (index: number, event: Event) => {
		const target = event.target as HTMLInputElement;
		if (editingIndex.value === index && editingMode.value === 'hex') editingValue.value = target.value;
		const value = parseInt(target.value, 16);
		if (!Number.isNaN(value) && value >= 0 && value <= 0xFF && debugOverrides.value) {
			vm?.value.writeDebug(startAddress.value + index, value, debugOverrides.value);
		}
	};

	const handleAsciiChange = (index: number, event: Event) => {
		const target = event.target as HTMLInputElement;
		const val = target.value;
		if (val.length > 0) {
			let code = val.charCodeAt(0);
			if (highBitEnabled.value) code |= 0x80;
			if(debugOverrides.value) vm?.value.writeDebug(startAddress.value + index, code, debugOverrides.value);
			const nextIndex = index + 1;
			if (nextIndex < visibleRowCount.value * BYTES_PER_LINE) {
				nextTick(() => {
					asciiInputRefs.value.get(nextIndex)?.focus();
				});
			} else {
				target.select();
			}
		}
	};

	const getAsciiChar = (byte: number | undefined) => {
		if (byte === undefined) return '·';
		const val = byte & 0x7F;
		if (val >= 32 && val <= 126) return String.fromCharCode(val);
		return '·';
	};

	const getAsciiClass = (byte: number | undefined, highlighted = false) => {
		if (highlighted) return 'bg-yellow-600 text-white';
		if (byte === undefined) return 'text-gray-500';
		const val = byte & 0x7F;
		if (val < 0x20) return 'text-gray-500';
		// bit7=0 -> Inverse (Black on White)
		// bit7=1 -> Normal (Green on Transparent)
		return (byte & 0x80) ? 'bg-transparent text-green-300' : 'bg-gray-100 text-black';
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

		if (vm?.value && debugOverrides.value) {
			for (let i = 0; i < length; i++) {
				slice[i] = vm.value.readDebug(start + i, debugOverrides.value);
			}
		}
		currentMemorySlice.value = slice;
	}, { immediate: true, deep: true });

</script>
