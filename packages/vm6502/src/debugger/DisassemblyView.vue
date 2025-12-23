<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col" ref="scrollContainer">
		<!-- Header combining title, count, and action button -->
		<div class="flex justify-between items-center mb-3 border-b border-gray-700/50 pb-2 shrink-0">
			<h2 class="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
				Disassembly
			</h2>

			<div class="flex items-center space-x-2 mx-4">
				<div class="relative group">
					<span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-mono">$</span>
					<input
						v-model="gotoAddressInput"
						@keydown.enter="handleGotoAddress"
						type="text"
						class="w-20 bg-gray-900 text-gray-200 text-xs font-mono rounded px-2 pl-4 py-1 border border-gray-700 focus:border-cyan-500 focus:outline-none transition-all focus:w-24"
						placeholder="Addr"
						title="Enter address (hex)"
					/>
				</div>
				<button
					@click="syncToPc"
					:class="['p-1 rounded transition-colors', isFollowingPc ? 'text-cyan-400 bg-cyan-400/10' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700']"
					title="Sync with PC"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>

			<button
				@click="handleExplain"
				:disabled="isLoading || (disassembly && disassembly.length === 0)"
				class="text-xs px-3 py-1 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition duration-150 shadow-md flex items-center disabled:opacity-50"
			>
				{{ isLoading ? 'Analyzing...' : 'Explain Code Block ✨' }}
			</button>
		</div>

		<!-- Explanation Result Panel -->
		<div v-if="explanation" class="mb-3 p-3 bg-gray-700 rounded-lg text-sm text-gray-200 shadow-inner shrink-0">
			<p class="font-semibold text-cyan-400 mb-1">AI Analysis:</p>
			<p class="whitespace-pre-wrap">{{ explanation }}</p>
		</div>

		<!-- Scrollable disassembly table -->
		<div
			ref="disassemblyContainer"
			class="font-mono text-xs overflow-y-hidden flex-grow min-h-0 bg-gray-900 p-2 rounded-md"
			@wheel.prevent="handleScroll"
		>
			<p v-if="!disassembly || disassembly.length === 0" class="text-gray-500 italic p-4 text-center">
				Disassembly data is empty or unavailable. (Check console for debug logs)
			</p>
			<table v-else class="w-full">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md z-10">
						<th class="py-1 text-center w-8">BP</th>
						<th class="py-1 text-left px-2 w-24">Addr</th>
						<th class="py-1 text-left w-20">Raw Bytes</th>
						<th class="py-1 text-left w-36">Opcode</th>
						<th class="py-1 text-left flex-grow">Comment</th>
						<th class="py-1 text-right w-12">Cycles</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="(line, index) in disassembly"
						:key="index"
						:class="[
							'hover:bg-gray-700 transition duration-100 border-l-4',
							line.address === address ?
								'bg-yellow-800/70 text-yellow-100 font-bold border-yellow-400'
								: 'border-transparent text-gray-300'
						]"
					>
						<td class="py-0.5 text-center">
							<button @click="onToggleBreakpoint(line.address)" class="w-full h-full flex items-center justify-center cursor-pointer group">
								<span class="w-2 h-2 rounded-full transition-colors"
									:class="getBreakpointClass(line.address)"></span>
							</button>
						</td>
						<td class="py-0.5 px-2 tabular-nums text-indigo-300 font-mono">
							{{ formatAddress(line.address) }}
						</td>
						<td class="py-0.5 tabular-nums text-gray-400">
							{{ line.rawBytes }}
						</td>
						<td class="py-0.5 text-left flex items-center">
							<span>{{ getLabeledInstruction(line.opcode).labeledOpcode }}</span>
							<span v-if="line.address === address && getBranchPrediction(line.opcode)"
								:class="['ml-2', getBranchPrediction(line.opcode)?.color]"
								:title="getBranchPrediction(line.opcode)?.title">
								{{ getBranchPrediction(line.opcode)?.char }}
							</span>
						</td>
						<td class="py-0.5 text-left text-gray-500 italic">
							{{ line.comment || (getLabeledInstruction(line.opcode).labelComment ? '; ' + getLabeledInstruction(line.opcode).labelComment : '') }}
						</td>
						<td class="py-0.5 text-center text-gray-400">
							{{ line.cycles }}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script lang="ts" setup>
	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

import { computed, inject, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useDisassembly } from "@/composables/useDisassembly";
import { useLabeling } from "@/composables/useLabeling";
import { disassemble } from "@/lib/disassembler";
import { handleExplainCode } from "@/lib/gemini.utils";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine.class";

	const vm= inject<Ref<VirtualMachine>>("vm");

	interface Props {
		address: number;
		memory: Uint8Array<ArrayBufferLike>;
		registers: EmulatorState['registers'];
	}
	const { address, memory, registers} = defineProps<Props>();

	const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();
	const { jumpEvent } = useDisassembly();

	const onToggleBreakpoint = (address: number) => {
		toggleBreakpoint({ type: 'pc', address }, vm?.value);
	};

	const getBreakpointClass = (address: number) => {
		if (pcBreakpoints.value.has(address)) {
			return pcBreakpoints.value.get(address)
				? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]' // Enabled
				: 'bg-transparent border-2 border-red-500/40';      // Disabled
		}
		return 'bg-gray-700 group-hover:bg-red-500/50';
	};

	const busState = computed(() => vm?.value?.busState ?? {});

	const getExecutionBankForAddress = (addr: number) => {
		const state = busState.value;
		if (!state || Object.keys(state).length === 0) return 0;
		// This logic is for READ operations, which is what instruction fetch is.
		if (addr < 0x0200 && state.altZp) return 0x01;
		if (addr >= 0x0200 && addr < 0xc000 && state.ramRdAux) return 0x01;
		if (addr >= 0xd000 && state.altZp) return 0x01;
		return 0x00;
	};

	const fullPcAddress = computed(() => {
		const bank = getExecutionBankForAddress(address);
		return address | (bank << 16);
	});

	const disassemblyStartAddress = ref(fullPcAddress.value);
	const disassembly = ref<DisassemblyLine[]>([]);
	const isFollowingPc = ref(true);
	const gotoAddressInput = ref("");

	const handleGotoAddress = () => {
		let val = gotoAddressInput.value.trim();
		if (!val) return;
		// Remove $ or 0x prefixes
		val = val.replace(/^\$/, '').replace(/^0x/i, '');
		const addr = parseInt(val, 16);
		if (!Number.isNaN(addr)) {
			disassemblyStartAddress.value = addr;
			isFollowingPc.value = false;
			gotoAddressInput.value = "";
		}
	};

	const syncToPc = () => {
		isFollowingPc.value = !isFollowingPc.value;
		if (isFollowingPc.value) {
			disassemblyStartAddress.value = fullPcAddress.value;
		}
	};

	let memoryProxy:Uint8Array<ArrayBufferLike>;


	// Helper to find the start of the previous instruction.
	// It does this by disassembling a small chunk before the target address
	// and finding the last instruction boundary in that chunk.
	const findPreviousInstructionAddress = (startAddr: number): number => {
		if (startAddr <= 0) return 0;
		// Go back a few bytes (max instruction length is 3) and disassemble
		const lookbehind = 4;
		const searchStart = Math.max(0, startAddr - lookbehind);
		const tempDisassembly = disassemble(memoryProxy, searchStart, lookbehind);

		// The last instruction in this temp block whose address is less than startAddr is our target.
		for (let line of tempDisassembly.reverse())
			if(line.address < startAddr) return line.address;

		// Fallback if something goes wrong
		return Math.max(0, startAddr - 1);
	};

	const formatAddress = (addr: number) => {
		const bank = ((addr >> 16) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
		const offset = (addr & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
		return `$${bank}:${offset}`;
	};

	const handleScroll = (event: WheelEvent) => {
		if (isFollowingPc.value) isFollowingPc.value = false;

		if (!disassembly.value || disassembly.value.length < 2) return;

		if (event.deltaY < 0) { // Scroll Up
			const newStartAddress = findPreviousInstructionAddress(disassemblyStartAddress.value);
			disassemblyStartAddress.value = newStartAddress;
		} else { // Scroll Down
			// The new start address is the address of the second line
			const newStartAddress = disassembly.value[1]?.address ?? 0;
			disassemblyStartAddress.value = newStartAddress;
		}
	};

	const explanation = ref(null);
	const isLoading = ref(false);
	const getLabeledInstruction = useLabeling();

	const scrollContainer = ref<HTMLElement | null>(null);
	const containerHeight = ref(0);
	const TABLE_ROW_HEIGHT = 20.5;
	const TABLE_HEADER_HEIGHT = 24.5;
	const PANEL_TITLE_HEIGHT = 33;
	const PANEL_TITLE_MB_HEIGHT = 12;
	let resizeObserver: ResizeObserver | null = null;

	const visibleRowCount = computed(() => {
		if (containerHeight.value === 0) return 10; // Default before mounted
		return Math.max(1, Math.floor((containerHeight.value - TABLE_HEADER_HEIGHT - PANEL_TITLE_HEIGHT - PANEL_TITLE_MB_HEIGHT) / TABLE_ROW_HEIGHT));
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

		memoryProxy= new Proxy(memory, {
			get(target, prop, _receiver) {
				if (typeof prop === 'string') {
					const idx = Number(prop);
					if (Number.isInteger(idx) && vm?.value) {
						return vm.value.readDebug(idx);
					}
				}
				return Reflect.get(target, prop);
			}
		});
	});

	onUnmounted(() => resizeObserver?.disconnect());

	watch(
		() => fullPcAddress.value,
		(newAddress, oldAddress) => {
			if (!isFollowingPc.value) return;

			// Try to keep the PC at the same visual row index as before.
			const oldIndex = disassembly.value.findIndex((line) => line.address === oldAddress);

			if (oldIndex === -1) {
				// If old PC wasn't visible, just snap to the new PC (default behavior)
				disassemblyStartAddress.value = newAddress; // this is now 24-bit
				return;
			}

			const newIndexInOldView = disassembly.value.findIndex((line) => line.address === newAddress);

			// Optimization: If moving forward within the current view, we can just shift the start address
			if (newIndexInOldView !== -1 && newIndexInOldView >= oldIndex) {
				const offset = newIndexInOldView - oldIndex;
				if (offset < disassembly.value.length) {
					disassemblyStartAddress.value = disassembly.value[offset]?.address ?? 0;
				}
			} else {
				// Fallback: Calculate backwards from newAddress to find the start address
				// that puts newAddress at oldIndex.
				let targetStart = newAddress;
				for (let i = 0; i < oldIndex; i++) {
					targetStart = findPreviousInstructionAddress(targetStart);
				}
				disassemblyStartAddress.value = targetStart;
			}
		}
	);

	watch( // Re-disassemble when the start address or memory changes
		() => [disassemblyStartAddress.value, memory, visibleRowCount.value, busState.value, registers],
		() => {
			if (memory) {

				vm?.value?.syncBusState();

				// Disassemble enough lines to fill the view (e.g., 50 lines)
				disassembly.value = disassemble(memoryProxy, disassemblyStartAddress.value, visibleRowCount.value, registers);
			}
		},
		{ immediate: true, deep: true },
	);

	// Watch for external jump requests (e.g. from TraceView)
	watch(jumpEvent, (event) => {
		if (event) {
			isFollowingPc.value = false;
			disassemblyStartAddress.value = event.address;
		}
	});

	const getBranchPrediction = (opcode: string) => {
		// Defensive check for props.registers (already added in last iteration, keeping it)
		if (!registers) return null;

		const { N, Z, C, V } = registers;
		let isTaken = false;

		if (opcode.startsWith('BNE')) isTaken = !Z;
		else if (opcode.startsWith('BEQ')) isTaken = Z;
		else if (opcode.startsWith('BPL')) isTaken = !N;
		else if (opcode.startsWith('BMI')) isTaken = N;
		else if (opcode.startsWith('BCC')) isTaken = !C;
		else if (opcode.startsWith('BCS')) isTaken = C;
		else if (opcode.startsWith('BVC')) isTaken = !V;
		else if (opcode.startsWith('BVS')) isTaken = V;

		if (opcode.startsWith('B') && !['BRK', 'BIT'].includes(opcode)) {
			if (isTaken) {
				return { char: '→', title: 'Branch Taken', color: 'text-green-400' };
			} else {
				return { char: '↓', title: 'Branch Not Taken', color: 'text-red-400' };
			}
		}
		return null;
	};

	const handleExplain = async () => {
		isLoading.value = true;
		explanation.value = null;

		// Use the currently displayed lines for explanation
		const codeArray = disassembly.value;

		const codeBlock = codeArray.map(line => {
			const { labeledOpcode, labelComment } = getLabeledInstruction(line.opcode);
			const finalComment = line.comment || (labelComment ? `; ${labelComment}` : '');

			const addr = `$${line.address.toString(16).toUpperCase().padStart(4, '0')}`;
			const bytes = line.rawBytes.padEnd(6, ' ');
			const op = labeledOpcode.padEnd(20, ' ');

			return `${addr} ${bytes} ${op} ${finalComment}`;
		}).join('\n');

		await handleExplainCode(codeBlock, explanation, isLoading);
	};
</script>
