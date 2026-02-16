<template>
	<div :class="['p-4 rounded-lg shadow-xl h-full flex flex-col transition-all duration-200', isActive ? 'bg-gray-800 ring-1 ring-cyan-500' : 'bg-gray-800/20']" ref="scrollContainer">
		<div class="mb-3 mt-1 flex flex-wrap items-center gap-4 shrink-0">
			<div class="flex flex-1 items-center gap-2" >
				<AddressNavigator @goto="handleGoto" />
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

			<BinaryLoader :address="startAddress" :debug-overrides="debugOverrides" />

			<!-- Active Debug Badges -->
			<div v-if="activeDebugBadges.length > 0" class="flex items-center gap-2 ml-auto">
				<div v-for="badge in activeDebugBadges" :key="badge.id" class="flex items-center px-2 py-0.5 rounded bg-cyan-900/40 border border-cyan-700/50 text-[10px] text-cyan-200 font-medium shadow-sm">
					<span class="uppercase tracking-wider">{{ badge.label }}</span>
					<span v-if="badge.value" class="ml-1 text-cyan-100 font-bold">: {{ badge.value }}</span>
				</div>
			</div>

			<!-- Debug Options -->
			<DebugOptionsPopover ref="debugOptionsPopover" category="memory" align="end" :class="activeDebugBadges.length > 0 ? '' : 'ml-auto'" />

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
								:class="['w-full text-center focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums text-xs', editingIndex === ((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)) ? 'bg-yellow-600' : (isHighlighted((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)) ? 'bg-yellow-600/50 text-white font-bold' : (isContextMenuTarget((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)) ? 'bg-gray-600 ring-1 ring-cyan-500' : 'bg-transparent')), getBreakpointClass((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1))]"
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
								:class="['w-[1.2ch] text-center focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums text-xs p-0 border-none font-bold', getAsciiClass(currentMemorySlice[(lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)], isHighlighted((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1)), editingIndex === ((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1))), getBreakpointClass((lineIndex - 1) * BYTES_PER_LINE + (byteIndex - 1))]"
							/>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<Popover :open="contextMenu.isOpen" @update:open="(val) => contextMenu.isOpen = val" :key="`${contextMenu.x}-${contextMenu.y}`">
			<PopoverTrigger as-child>
				<div class="fixed w-0 h-0 invisible" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"></div>
			</PopoverTrigger>
			<PopoverContent class="w-48 p-1 bg-gray-800 border-gray-700 text-gray-200 text-xs" align="start" side="bottom" :side-offset="10">
				<div class="px-2 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-700 mb-1">
					Address: {{ formatAddress(contextMenu.address) }}
				</div>
				<button @click="disassembleHere" class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center">
					Disassemble Here
				</button>
				<button @click="addBp('read')" class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center">
					Break on Read
				</button>
				<button @click="addBp('write')" class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center">
					Break on Write
				</button>
				<button @click="addBp('access')" class="w-full text-left px-2 py-1.5 hover:bg-gray-700 rounded flex items-center">
					Break on Access
				</button>
			</PopoverContent>
		</Popover>
	</div>
</template>

<script lang="ts" setup>
	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

	import { Search, Split, X } from "lucide-vue-next";
import { computed, inject, nextTick, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import AddressNavigator from "@/app/debugger/AddressNavigator.vue";
import DebugOptionsPopover from "@/components/DebugOptionsPopover.vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useDisassembly } from "@/composables/useDisassembly";
import type { DebugGroup } from "@/types/machine.interface";
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

	const banks = vm?.value.machineConfig.memory.banks || 1;
	const totalMemory = banks * 0x10000;
	const BYTES_PER_LINE = 16;
	const startAddress = ref(props.initialAddress ?? 0x0000);

	const scrollContainer = ref<HTMLElement | null>(null);
	const containerHeight = ref(0);
	const ROW_HEIGHT_ESTIMATE = 22; // Estimated height of a row in pixels
	let resizeObserver: ResizeObserver | null = null;

	const { memoryViewAddress, setActiveTab } = useDebuggerNav();
	const { requestJump } = useDisassembly();
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

	const highBitEnabled = ref(false);

	const handleGoto = (addr: number) => { if(addr<totalMemory ) startAddress.value = addr; }

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

	const isContextMenuTarget = (index: number) => {
		return contextMenu.value.isOpen && contextMenu.value.address === (startAddress.value + index);
	};

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

	const disassembleHere = () => {
		requestJump(contextMenu.value.address);
		setActiveTab('disassembly');
		closeContextMenu();
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

	onUnmounted(() => { resizeObserver?.disconnect(); });

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

	const getAsciiClass = (byte: number | undefined, highlighted = false, selected = false) => {
		if (selected) return 'bg-yellow-600 text-white';
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
