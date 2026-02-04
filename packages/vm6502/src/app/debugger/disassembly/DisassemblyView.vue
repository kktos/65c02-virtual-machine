<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col" ref="scrollContainer">
		<!-- Header combining title, count, and action button -->
		<DisassemblyToolbar
			:can-navigate-back="canNavigateBack"
			:can-navigate-forward="canNavigateForward"
			:is-following-pc="isFollowingPc"
			:is-loading="isLoading"
			:has-disassembly="!!(disassembly && disassembly.length > 0)"
			:available-scopes="availableScopes"
			@navigate-back="navigateBack"
			@navigate-forward="navigateForward"
			@sync-to-pc="syncToPc"
			@explain="handleExplain"
			@goto-address="onGotoAddress"
		/>

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
						<th class="py-1 text-center w-8"></th>
						<th class="py-1 text-left px-2 w-20">Addr</th>
						<th class="py-1 text-left w-20"></th>
						<th class="py-1 text-left w-36">Opcode</th>
						<th class="py-1 text-left flex-grow">Comment</th>
						<th v-if="settings.disassembly.showCycles" class="py-1 text-right w-12">Cycles</th>
					</tr>
				</thead>
				<tbody>
					<template v-for="(line) in disassembly" :key="line.address">
						<tr v-if="getLabelForAddress(line.address, vm?.getScope(line.address))">
							<td colspan="6" class="py-0.5 px-2 text-yellow-500 font-bold font-mono text-xs border-l-4 border-transparent" :style="getLabelStyle(line.address)">
								{{ getLabelForAddress(line.address, vm?.getScope(line.address)) }}:
							</td>
						</tr>
						<tr
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
						<td
							class="py-0.5 px-2 tabular-nums text-indigo-300 font-mono cursor-pointer"
							:style="getScopeStyle(line.address)"
							:title="`Scope: ${getScopeDisplay(line.address)} | CTRL+Click to view in Memory Viewer`"
							@click.ctrl.prevent="handleAddressClick(line.address)"
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
							@click.ctrl.prevent="handleOpcodeClick(line)">
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
						<td v-if="settings.disassembly.showCycles" class="py-0.5 text-center text-gray-400">
							{{ line.cycles }}
						</td>
					</tr>
					</template>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script lang="ts" setup>

	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

import { computed, inject, onMounted, type Ref, ref, watch } from "vue";
import DisassemblyToolbar from "@/app/debugger/disassembly/DisassemblyToolbar.vue";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useDisassembly } from "@/composables/useDisassembly";
import { useDisassemblyScroll } from "@/composables/useDisassemblyScroll";
import { useLabeling } from "@/composables/useLabeling";
import { useSettings } from "@/composables/useSettings";
import { disassemble } from "@/lib/disassembler";
import { handleExplainCode } from "@/lib/gemini.utils";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

	const vm= inject<Ref<VirtualMachine>>("vm");

	interface Props {
		address: number;
		memory: Uint8Array<ArrayBufferLike>;
		registers: EmulatorState['registers'];
	}
	const { address, memory, registers} = defineProps<Props>();

	const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();
	const { jumpEvent } = useDisassembly();
	const { setMemoryViewAddress, setActiveTab, addJumpHistory, historyNavigationEvent,navigateHistory, jumpHistory, historyIndex } = useDebuggerNav();
	const { settings } = useSettings();

	const availableScopes: Ref<string[]>= ref([]);
	const getRandomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

	watch(() => vm?.value, async (newVm) => {
		if (newVm) {
			await newVm.ready;
			const scopes = newVm.getScopes();
			availableScopes.value = scopes;
			for (const scope of scopes) {
				if (!settings.disassembly.scopeColors[scope])
					settings.disassembly.scopeColors[scope] = getRandomColor();
			}
		}
	}, { immediate: true });

	const handleAddressClick = (address: number) => {
		setMemoryViewAddress(address);
		setActiveTab('memory');
	};

	const getEffectiveAddress = (line: DisassemblyLine): number | null => {
		const operand = line.opcode.split(' ').slice(1).join(' ');
		if (!operand) return null;

		// Regex for different addressing modes
		const indirectX = operand.match(/\(\$([0-9A-F]{2}),X\)/i) as [string, string] | null;
		if (indirectX && vm?.value) {
			const zpAddr = parseInt(indirectX[1], 16);
			const pointerAddr = (zpAddr + registers.X) & 0xFF;
			const lo = vm.value.readDebug(pointerAddr);
			const hi = vm.value.readDebug((pointerAddr + 1) & 0xFF);
			return (hi << 8) | lo;
		}

		const indirectY = operand.match(/\(\$([0-9A-F]{2})\),Y/i) as [string, string] | null;
		if (indirectY && vm?.value) {
			const zpAddr = parseInt(indirectY[1], 16);
			const lo = vm.value.readDebug(zpAddr);
			const hi = vm.value.readDebug((zpAddr + 1) & 0xFF);
			const baseAddr = (hi << 8) | lo;
			return (baseAddr + registers.Y) & 0xFFFF;
		}

		const absoluteIndexed = operand.match(/\$([0-9A-F]{4}),([XY])/i) as [string, string, string] | null;
		if (absoluteIndexed) {
			const base = parseInt(absoluteIndexed[1], 16);
			const indexReg = absoluteIndexed[2].toUpperCase() as 'X' | 'Y';
			const offset = registers[indexReg];
			return (base + offset) & 0xFFFF;
		}

		const zpIndexed = operand.match(/\$([0-9A-F]{2}),([XY])/i) as [string, string, string] | null;
		if (zpIndexed) {
			const base = parseInt(zpIndexed[1], 16);
			const indexReg = zpIndexed[2].toUpperCase() as 'X' | 'Y';
			const offset = registers[indexReg];
			return (base + offset) & 0xFF;
		}

		const absolute = operand.match(/\$([0-9A-F]{2,4})/) as [string, string] | null;
		if (absolute) {
			return parseInt(absolute[1], 16);
		}

		return null;
	}

	watch(historyNavigationEvent, (event) => {
		if (event) {
			isFollowingPc.value = false;
			disassemblyStartAddress.value = event.address;
		}
	});

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
		return vm?.value?.getScope(addr) === 'aux' ? 0x01 : 0x00;
	};

	const fullPcAddress = computed(() => {
		const bank = getExecutionBankForAddress(address);
		return address | (bank << 16);
	});

	const disassemblyStartAddress = ref(fullPcAddress.value);
	const disassembly = ref<DisassemblyLine[]>([]);
	const isFollowingPc = ref(true);

	const onGotoAddress = (addr: number) => {
		disassemblyStartAddress.value = addr;
		isFollowingPc.value = false;
	};

	const syncToPc = () => {
		isFollowingPc.value = !isFollowingPc.value;
		if (isFollowingPc.value) {
			disassemblyStartAddress.value = fullPcAddress.value;
		}
	};

	const { scrollContainer, visibleRowCount, handleScroll, memoryProxy, findPreviousInstructionAddress } = useDisassemblyScroll(
		vm,
		memory,
		disassembly,
		disassemblyStartAddress,
		isFollowingPc
	);

	const formatAddress = (addr: number) => {
		const bank = ((addr >> 16) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
		const offset = (addr & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
		return `$${bank}:${offset}`;
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

	const explanation = ref(null);
	const isLoading = ref(false);
	const { getLabeledInstruction, getLabelForAddress } = useLabeling();

	onMounted(() => {
		// Initialize history with the starting address if it's empty
		if (historyIndex.value === -1) {
			addJumpHistory(fullPcAddress.value);
		}
	});

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
		() => [disassemblyStartAddress.value, memory, visibleRowCount.value, busState.value, registers, vm?.value?.symbolsVersion.value],
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

	const handleOpcodeClick = (line: DisassemblyLine) => {
		const mnemonic = line.opcode.substring(0, 3);
		const operandStr = line.opcode.substring(4);

		const isPcAffecting = ['JMP', 'JSR', 'BCC', 'BCS', 'BEQ', 'BMI', 'BNE', 'BPL', 'BVC', 'BVS'].includes(mnemonic);

		if (isPcAffecting) {
			const targetMatch = operandStr.match(/\$([0-9A-F]+)/) as [string, string] | null;
			if (targetMatch) {
				const targetAddr = parseInt(targetMatch[1], 16);
				if (!Number.isNaN(targetAddr)) {
					const currentBank = line.address & 0xFF0000;
					const newAddress = currentBank | targetAddr;
					addJumpHistory(newAddress);
					isFollowingPc.value = false;
					disassemblyStartAddress.value = newAddress;
				}
			}
		} else {
			const effectiveAddress = getEffectiveAddress(line);
			if (effectiveAddress !== null) {
				let bank = 0;
				if (vm?.value?.getScope(effectiveAddress) === 'aux') {
					bank = 0x01;
				}

				setMemoryViewAddress((bank << 16) | effectiveAddress);
				setActiveTab('memory');
			}
		}
	};

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

	const canNavigateBack = computed(() => historyIndex.value > 0);
	const canNavigateForward = computed(() => historyIndex.value < jumpHistory.value.length - 1);
	const navigateBack = () => navigateHistory('back');
	const navigateForward = () => navigateHistory('forward');

</script>
