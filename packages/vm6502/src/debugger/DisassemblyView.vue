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
			<p v-if="!disassembly || disassembly.length === 0" class="text-gray-500 italic p-4 text-center">
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
						v-for="(line, index) in disassembly"
						:key="index"
						:class="[
							'hover:bg-gray-700 transition duration-100',
							line.address === PC ? 'bg-yellow-800/70 text-yellow-100 font-bold border-l-4 border-yellow-400' : 'text-gray-300'
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
							<span v-if="line.address === PC && getBranchPrediction(line.opcode)"
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

import { type Ref, ref } from "vue";
import { useLabeling } from "@/lib/utils";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";

	interface Props {
		disassembly: DisassemblyLine[];
		PC: number;
		registers: EmulatorState['registers'];
		onExplainCode: (codeBlock: string, setExplanation: Ref<string | null>, setIsLoading: Ref<boolean>) => Promise<void>;
	}
	const { disassembly, PC, registers } = defineProps<Props>();

	const explanation = ref(null);
	const isLoading = ref(false);
	const getLabeledInstruction = useLabeling();

	// console.log("DisassemblyView received data. Type:", typeof disassembly, "Length:", disassembly ? disassembly.length : 0);

	if (disassembly && !Array.isArray(disassembly)) {
		console.warn("Disassembly prop received is NOT an array inside Vue runtime. Received:", disassembly);
	}
	// -----------------------------


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
		// isLoading.value = true;
		// explanation.value = null;

		// // Ensure disassembly is treated as an array for mapping
		// const codeArray = Array.isArray(disassembly) ? disassembly : [];

		// const codeBlock = codeArray.map(line => {
		// 	const { labeledOpcode, labelComment } = getLabeledInstruction(line.opcode);
		// 	const finalComment = line.comment || (labelComment ? `; ${labelComment}` : '');

		// 	const addr = `$${line.address.toString(16).toUpperCase().padStart(4, '0')}`;
		// 	const bytes = line.rawBytes.padEnd(6, ' ');
		// 	const op = labeledOpcode.padEnd(20, ' ');

		// 	return `${addr} ${bytes} ${op} ${finalComment}`;
		// }).join('\n');

		// await onExplainCode(codeBlock, explanation, isLoading);
	};
</script>
