<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col" ref="scrollContainer">
		<!-- Header combining title, count, and action button -->
		<div class="flex justify-between items-center mb-3 border-b border-gray-700/50 pb-2 shrink-0">
			<h2 class="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
				Disassembly
			</h2>

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
			class="font-mono text-xs overflow-y-auto flex-grow min-h-0 bg-gray-900 p-2 rounded-md"
			@wheel.prevent="handleScroll"
		>
			<p v-if="!disassembly || disassembly.length === 0" class="text-gray-500 italic p-4 text-center">
				Disassembly data is empty or unavailable. (Check console for debug logs)
			</p>
			<table v-else class="w-full">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md z-10">
						<th class="py-1 text-center w-8">BP</th>
						<th class="py-1 text-left px-2 w-16">Addr</th>
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
							'hover:bg-gray-700 transition duration-100',
							line.address === address ? 'bg-yellow-800/70 text-yellow-100 font-bold border-l-4 border-yellow-400' : 'text-gray-300'
						]"
					>
						<td class="py-0.5 text-center">
							<button @click="onToggleBreakpoint(line.address)" class="w-full h-full flex items-center justify-center cursor-pointer group">
								<span class="w-2 h-2 rounded-full transition-colors"
									:class="breakpoints.has(line.address) ? 'bg-red-500' : 'bg-gray-700 group-hover:bg-red-500/50'"></span>
							</button>
						</td>
						<td class="py-0.5 px-2 tabular-nums text-indigo-300">
							{{ '$' + line.address.toString(16).toUpperCase().padStart(4, '0') }}
						</td>
						<td class="py-0.5 tabular-nums text-gray-400">
							{{ line.rawBytes }}
						</td>
						<td class="py-0.5 text-left flex items-center">
							<span>{{ getLabeledInstruction(line.opcode).labeledOpcode }}</span>
							<span v-if="line.address === address && getBranchPrediction(line.opcode)"
								:class="['font-bold ml-2 text-base', getBranchPrediction(line.opcode)?.color]"
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
import { disassemble } from "@/lib/disassembler";
import { handleExplainCode } from "@/lib/gemini.utils";
import { useLabeling } from "@/lib/utils";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/vm.class";

	const vm= inject<Ref<VirtualMachine>>("vm");

	interface Props {
		address: number;
		memory: Uint8Array<ArrayBufferLike>;
		registers: EmulatorState['registers'];
	}
	const { address, memory, registers} = defineProps<Props>();
	// const disassemblyContainer = ref<HTMLElement | null>(null);

	const breakpoints= ref<Set<number>>(new Set<number>());

	const onToggleBreakpoint = (address: number) => {
		if (breakpoints.value.has(address)) {
			breakpoints.value.delete(address);
			vm?.value.removeBP("pc", address);
		} else {
			breakpoints.value.add(address);
			vm?.value.addBP("pc", address);
		}
	};

	const disassemblyStartAddress = ref(address);
	const disassembly = ref<DisassemblyLine[]>([]);

	// Helper to find the start of the previous instruction.
	// It does this by disassembling a small chunk before the target address
	// and finding the last instruction boundary in that chunk.
	const findPreviousInstructionAddress = (startAddr: number): number => {
		if (startAddr <= 0) return 0;
		// Go back a few bytes (max instruction length is 3) and disassemble
		const lookbehind = 4;
		const searchStart = Math.max(0, startAddr - lookbehind);
		const tempDisassembly = disassemble(memory, searchStart, lookbehind);

		// The last instruction in this temp block whose address is less than startAddr is our target.
		for (let line of tempDisassembly.reverse())
			if(line.address < startAddr) return line.address;

		// Fallback if something goes wrong
		return Math.max(0, startAddr - 1);
	};

	const handleScroll = (event: WheelEvent) => {
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
	});

	onUnmounted(() => resizeObserver?.disconnect());

	watch(
		() => address,
		(newAddress) => {
			// When the PC changes, update the disassembly start address to follow it.
			disassemblyStartAddress.value = newAddress;
		}
	);

	watch( // Re-disassemble when the start address or memory changes
		() => [disassemblyStartAddress.value, memory, visibleRowCount.value],
		() => {
			if (memory) {
				// Disassemble enough lines to fill the view (e.g., 50 lines)
				disassembly.value = disassemble(memory, disassemblyStartAddress.value, visibleRowCount.value );
			}
		},
		{ immediate: true, deep: true },
	);

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
