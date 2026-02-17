<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col" ref="scrollContainer">
		<!-- Header combining title, count, and action button -->
		<DisassemblyToolbar
			:is-following-pc="isFollowingPc"
			:is-loading="isLoading"
			:has-disassembly="!!(disassembly && disassembly.length > 0)"
			:available-scopes="availableScopes"
			@open-symbol-manager="isSymbolManagerOpen = true"
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
			<DisassemblyTable
				v-else
				:registers="registers"
				:disassembly="disassembly"
				:address="fullPcAddress"
				:get-breakpoint-class="getBreakpointClass"
				@toggle-breakpoint="onToggleBreakpoint"
				@address-click="handleAddressClick"
				@opcode-click="handleOpcodeClick"
			/>
		</div>
		<SymbolManager
			:is-open="isSymbolManagerOpen"
			@update:is-open="(val) => isSymbolManagerOpen = val"
			@goto-address="onGotoAddress"
		/>
	</div>
</template>

<script lang="ts" setup>

	/** biome-ignore-all lint/correctness/noUnusedVariables: vue */


import { computed, inject, type Ref, ref, watch } from "vue";
import DisassemblyTable from "@/app/debugger/disassembly/DisassemblyTable.vue";
import DisassemblyToolbar from "@/app/debugger/disassembly/DisassemblyToolbar.vue";
import SymbolManager from "@/app/debugger/disassembly/SymbolManager.vue";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useDisassembly } from "@/composables/useDisassembly";
import { useDisassemblyScroll } from "@/composables/useDisassemblyScroll";
import { useFormatting } from "@/composables/useFormatting";
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";
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

	const isSymbolManagerOpen = ref(false);

	const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();
	const { jumpEvent } = useDisassembly();
	const { setMemoryViewAddress, setActiveTab, addJumpHistory, historyIndex, historyNavigationEvent, clearHistory } = useDebuggerNav();
	const { settings } = useSettings();
	const availableScopes: Ref<string[]>= ref([]);
	const { formattingRules } = useFormatting();
	const getRandomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
	const banks = vm?.value.machineConfig.memory.banks || 1;
	const totalMemory = banks * 0x10000;

	watch(() => vm?.value, async (newVm) => {
		if (newVm) {
			await newVm.ready;
			availableScopes.value = newVm.getScopes(); // This now returns namespaces due to parsing change
			for (const scope of availableScopes.value) {
				if (!settings.disassembly.scopeColors[scope])
					settings.disassembly.scopeColors[scope] = getRandomColor();
			}
			isFollowingPc.value = true;
			clearHistory();
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

	const fullPcAddress = computed(() => {
		const bank = vm?.value?.getBank(address) ?? 0;
		return address | (bank << 16);
	});

	const disassemblyStartAddress = ref(fullPcAddress.value);
	const disassembly = ref<DisassemblyLine[]>([]);
	const isFollowingPc = ref(true);

	const onGotoAddress = (addr: number) => {
		if(addr>=totalMemory) return;
		disassemblyStartAddress.value = addr;
		isFollowingPc.value = false;
	};

	const syncToPc = () => {
		if (isFollowingPc.value) {
			isFollowingPc.value = false;
		} else {
			isFollowingPc.value = true;
			const pcIsVisible = disassembly.value.some((line) => line.address === fullPcAddress.value);
			if (!pcIsVisible) {
				disassemblyStartAddress.value = fullPcAddress.value;
			}
		}
	};

	const { scrollContainer, visibleRowCount, handleScroll, findPreviousInstructionAddress } = useDisassemblyScroll(
		vm,
		disassembly,
		disassemblyStartAddress,
		ref(false)
	);

	// useless line - used as ref in template but not seen in VSCode
	scrollContainer;

	const explanation = ref(null);
	const isLoading = ref(false);
	const { getLabeledInstruction } = useSymbols();

	watch(
		() => fullPcAddress.value,
		(newAddress, oldAddress) => {
			if (!isFollowingPc.value) return;

			if(historyIndex.value===-1) addJumpHistory(newAddress);

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

	const readByte = (address: number, debug= true) => {
		return (debug ? vm?.value.readDebug(address) : vm?.value.read(address)) ?? 0;
	};

	watch( // Re-disassemble when the start address or memory changes
		() => [disassemblyStartAddress.value, memory, visibleRowCount.value, busState.value, registers, formattingRules.value],
		() => {
			if (memory) {
				vm?.value?.syncBusState();
				disassembly.value = disassemble(
					readByte,
					disassemblyStartAddress.value,
					visibleRowCount.value,
					registers
				);
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
