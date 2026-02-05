<template>
	<table class="w-full">
		<thead>
			<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md z-10">
				<th class="py-1 text-center w-8"></th>
				<th class="py-1 text-left px-2 w-20">Addr</th>
				<th class="py-1 text-left w-20"></th>
				<th class="py-1 text-left w-36">Opcode</th>
				<th class="py-1 text-left flex-grow">Comment</th>
				<th v-if="settings.disassembly.showCycles" class="py-1 text-right w-12">Cycles</th>
			</tr>
		</thead>
		<tbody>
			<template v-for="line in disassembly" :key="line.address">
				<tr v-if="getLabelForAddress(line.address, getScopeDisplay(line.address))">
					<td
						colspan="6"
						class="py-0.5 px-2 text-yellow-500 font-bold font-mono text-xs border-l-4 border-transparent"
						:style="getLabelStyle(line.address)"
					>
						{{ getLabelForAddress(line.address, getScopeDisplay(line.address)) }}:
					</td>
				</tr>
				<tr
					:class="[
						'hover:bg-gray-700 transition duration-100 border-l-4',
						line.address === address ? 'bg-yellow-800/70 text-yellow-100 font-bold border-yellow-400' : 'border-transparent text-gray-300',
					]"
				>
					<td class="py-0.5 text-center">
						<button @click="$emit('toggleBreakpoint', line.address)" class="w-full h-full flex items-center justify-center cursor-pointer group">
							<span class="w-2 h-2 rounded-full transition-colors" :class="getBreakpointClass(line.address)"></span>
						</button>
					</td>
					<td
						class="py-0.5 px-2 tabular-nums text-indigo-300 font-mono cursor-pointer"
						:style="getScopeStyle(line.address)"
						:title="`Scope: ${getScopeDisplay(line.address)} | CTRL+Click to view in Memory Viewer`"
						@click.ctrl.prevent="$emit('addressClick', line.address)"
					>
						{{ formatAddress(line.address) }}
					</td>
					<td class="py-0.5 tabular-nums text-gray-400">
						{{ line.rawBytes }}
					</td>
					<td
						class="py-0.5 text-left flex items-center"
						:class="{ 'cursor-pointer': isOpcodeClickable(line) }"
						:title="getOpcodeTitle(line)"
						@click.ctrl.prevent="$emit('opcodeClick', line)"
					>
						<span>{{ getLabeledInstruction(line.opcode).labeledOpcode }}</span>
						<span
							v-if="line.address === address && getBranchPrediction(line.opcode)"
							:class="['ml-2', getBranchPrediction(line.opcode)?.color]"
							:title="getBranchPrediction(line.opcode)?.title"
						>
							{{ getBranchPrediction(line.opcode)?.char }}
						</span>
					</td>
					<td class="py-0.5 text-left text-gray-500 italic">
						{{ line.comment || (getLabeledInstruction(line.opcode).labelComment ? "; " + getLabeledInstruction(line.opcode).labelComment : "") }}
					</td>
					<td v-if="settings.disassembly.showCycles" class="py-0.5 text-center text-gray-400">
						{{ line.cycles }}
					</td>
				</tr>
			</template>
		</tbody>
	</table>
</template>

<script lang="ts" setup>
import { inject, type Ref } from "vue";
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

	const vm= inject<Ref<VirtualMachine>>("vm");

	const { registers} = defineProps<{
		registers: EmulatorState['registers'];
		disassembly: DisassemblyLine[];
		address: number;
		getBreakpointClass: (address: number) => string;
	}>();

	defineEmits<{
		(e: "toggleBreakpoint", address: number): void;
		(e: "addressClick", address: number): void;
		(e: "opcodeClick", line: DisassemblyLine): void;
	}>();

	const { getLabeledInstruction, getLabelForAddress } = useSymbols();
	const { settings } = useSettings();

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

	const isOpcodeClickable = (line: DisassemblyLine) => {
		const mnemonic = line.opcode.substring(0, 3);
		const isPcAffecting = ['JMP', 'JSR', 'BCC', 'BCS', 'BEQ', 'BMI', 'BNE', 'BPL', 'BVC', 'BVS'].includes(mnemonic);
		if (isPcAffecting) return true;

		const operand = line.opcode.split(' ')[1] || '';
		return operand.includes('$'); // Simple check for an address operand
	};

	const getOpcodeTitle = (line: DisassemblyLine) => {
		if (!isOpcodeClickable(line)) return '';
		const mnemonic = line.opcode.substring(0, 3);
		const isPcAffecting = ['JMP', 'JSR', 'BCC', 'BCS', 'BEQ', 'BMI', 'BNE', 'BPL', 'BVC', 'BVS'].includes(mnemonic);
		if (isPcAffecting) return 'CTRL+Click to follow jump/branch';
		return 'CTRL+Click to view effective address in Memory Viewer';
	};

	const getScopeDisplay = (addr: number) => {
		const scope = vm?.value?.getScope(addr & 0xFFFF);
		return scope ?? "";
	};

	const getScopeStyle = (addr: number) => {
		const scope = vm?.value?.getScope(addr & 0xFFFF);
		if (!scope) return {};

		const color = settings.disassembly.scopeColors[scope];

		// Don't apply style for black/transparent or if not defined
		if (!color || color === '#000000' || color === '#00000000') return {};

		const opacity = "1A";

		return {
			backgroundColor: `${color}${opacity}`,
		};
	};

	const getLabelStyle = (addr: number) => {
		const scope = vm?.value?.getScope(addr & 0xFFFF);
		if (!scope) return {};

		const color = settings.disassembly.scopeColors[scope];

		// If color is black or transparent, use default class (yellow-500)
		if (!color || color === '#000000' || color === '#00000000') return {};

		return { color };
	};

	const formatAddress = (addr: number) => {
		const bank = ((addr >> 16) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
		const offset = (addr & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
		return `$${bank}:${offset}`;
	};

</script>
