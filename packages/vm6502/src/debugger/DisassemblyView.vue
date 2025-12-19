<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col">
		<!-- Header combining title, count, and action button -->
		<div class="flex justify-between items-center mb-3 border-b border-gray-700/50 pb-2 shrink-0">
			<h2 class="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
				Disassembly <span class="text-gray-400 font-normal">({{ disassembly && disassembly.length || 0 }} Instructions)</span>
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
		<div class="font-mono text-xs overflow-y-auto flex-grow min-h-0 bg-gray-900 p-2 rounded-md">
			<p v-if="!displayedDisassembly || displayedDisassembly.length === 0" class="text-gray-500 italic p-4 text-center">
				Disassembly data is empty or unavailable. (Check console for debug logs)
			</p>
			<table v-else class="w-full">
				<thead>
					<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md">
						<th class="py-1 text-left px-2 w-16">Addr</th>
						<th class="py-1 text-left w-20">Raw Bytes</th>
						<th class="py-1 text-left w-36">Opcode</th>
						<th class="py-1 text-left flex-grow">Comment</th>
						<th class="py-1 text-right w-12">Cycles</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="(line, index) in displayedDisassembly"
						:key="index"
						:class="[
							'hover:bg-gray-700 transition duration-100',
							line.address === address ? 'bg-yellow-800/70 text-yellow-100 font-bold border-l-4 border-yellow-400' : 'text-gray-300'
						]"
					>
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
						<td class="py-0.5 text-right text-gray-400">
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

import { computed, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import { disassemble } from "@/lib/disassembler";
import { useLabeling } from "@/lib/utils";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";

	interface Props {
		address: number;
		memory: Uint8Array<ArrayBufferLike>;
		registers: EmulatorState['registers'];
		onExplainCode: (codeBlock: string, setExplanation: Ref<string | null>, setIsLoading: Ref<boolean>) => Promise<void>;
	}
	const { address, memory, registers, onExplainCode } = defineProps<Props>();

	const explanation = ref(null);
	const isLoading = ref(false);
	const getLabeledInstruction = useLabeling();

	const disassemblyContainer = ref<HTMLElement | null>(null);
	const maxDisplayLines = ref(30); // Default to 30 lines
	const estimatedLineHeight = 16; // px, based on text-xs (12px) + py-0.5 (2*2px padding)

	const fullDisassembly = ref<DisassemblyLine[]>([]);

	let resizeObserver: ResizeObserver | null = null;

	const updateMaxDisplayLines = () => {
		if (disassemblyContainer.value) {
			const clientHeight = disassemblyContainer.value.clientHeight;
			// Ensure a minimum number of lines are always displayed
			maxDisplayLines.value = Math.max(10, Math.floor(clientHeight / estimatedLineHeight));
		}
	};

	onMounted(() => {
		updateMaxDisplayLines();
		resizeObserver = new ResizeObserver(updateMaxDisplayLines);
		if (disassemblyContainer.value)
			resizeObserver.observe(disassemblyContainer.value);
	});

	onUnmounted(() => {
		if (resizeObserver && disassemblyContainer.value)
			resizeObserver.unobserve(disassemblyContainer.value);
	});

	watch( // Re-disassemble a larger window when relevant props or display lines change
		() => [address, memory, maxDisplayLines],
		() => {
			if (memory) {
				// Disassemble a window larger than what's displayed to allow for centering
				const windowSize = maxDisplayLines.value * 2; // Disassemble twice the visible lines
				const startAddress = Math.max(0, address - Math.floor(windowSize / 2));
				const endAddress = Math.min(0xffff, address + Math.ceil(windowSize / 2));
				fullDisassembly.value = disassemble(memory, startAddress, endAddress);
			}
		},
		{ immediate: true, deep: true },
	);

	const displayedDisassembly = computed(() => {
		const currentPC = address;
		const linesToShow = maxDisplayLines.value;
		const halfLines = Math.floor(linesToShow / 2);

		const pcIndex = fullDisassembly.value.findIndex(line => line.address === currentPC);

		// PC not in the current fullDisassembly window, or fullDisassembly is empty
		// This can happen if the PC is outside the initially loaded window, or if memory is empty.
		// Just return the first 'linesToShow' lines or an empty array.
		if (pcIndex === -1)
			return fullDisassembly.value.slice(0, linesToShow);


		let startIndex = pcIndex - halfLines;
		let endIndex = pcIndex + (linesToShow - halfLines); // Adjust for odd/even linesToShow

		// Adjust if we go out of bounds at the beginning of fullDisassembly
		if (startIndex < 0) {
			endIndex -= startIndex; // Shift end index to compensate
			startIndex = 0;
		}

		// Adjust if we go out of bounds at the end of fullDisassembly
		if (endIndex > fullDisassembly.value.length) {
			startIndex -= (endIndex - fullDisassembly.value.length); // Shift start index to compensate
			endIndex = fullDisassembly.value.length;
			if (startIndex < 0) startIndex = 0; // Ensure start doesn't go negative again
		}

		return fullDisassembly.value.slice(startIndex, endIndex);
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

	const disassembly:string[]=[];
	const handleExplain = async () => {
		isLoading.value = true;
		explanation.value = null;

		// Use the currently displayed lines for explanation
		const codeArray = displayedDisassembly.value;

		const codeBlock = codeArray.map(line => {
			const { labeledOpcode, labelComment } = getLabeledInstruction(line.opcode);
			const finalComment = line.comment || (labelComment ? `; ${labelComment}` : '');

			const addr = `$${line.address.toString(16).toUpperCase().padStart(4, '0')}`;
			const bytes = line.rawBytes.padEnd(6, ' ');
			const op = labeledOpcode.padEnd(20, ' ');

			return `${addr} ${bytes} ${op} ${finalComment}`;
		}).join('\n');

		await onExplainCode(codeBlock, explanation, isLoading);
	};
</script>
