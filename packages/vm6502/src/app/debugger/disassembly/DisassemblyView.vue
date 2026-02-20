<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col" ref="scrollContainer">
		<!-- Header combining title, count, and action button -->
		<DisassemblyToolbar
			:is-following-pc="isFollowingPc"
			:is-loading="isLoading"
			:has-disassembly="!!(disassembly && disassembly.length > 0)"
			:available-scopes="availableScopes"
			@open-symbol-manager="isSymbolManagerOpen = true"
			@open-formatting-manager="isFormattingManagerOpen = true"
			@sync-to-pc="syncToPc"
			@explain="handleExplain"
			@goto-address="onGotoAddress"
		/>

		<!-- <div class="text-xs">{{ visibleRowCount }} / {{ pcRowIndex }}</div> -->

		<!-- Explanation Result Panel -->
		<div v-if="explanation" class="mb-3 p-3 bg-gray-700 rounded-lg text-sm text-gray-200 shadow-inner shrink-0">
			<p class="font-semibold text-cyan-400 mb-1">AI Analysis:</p>
			<p class="whitespace-pre-wrap">{{ explanation }}</p>
		</div>

		<!-- Scrollable disassembly table -->
		<div
			ref="disassemblyContainer"
			class="font-mono text-xs overflow-y-hidden flex-grow min-h-0 bg-gray-900 p-2 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-500"
			tabindex="0"
			@wheel.prevent="handleScroll"
			@keydown.prevent="handleKeyDown"
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
		<SymbolManager :is-open="isSymbolManagerOpen" @update:is-open="(val) => (isSymbolManagerOpen = val)" @goto-address="onGotoAddress" />
		<FormattingManager :is-open="isFormattingManagerOpen" @update:is-open="(val) => (isFormattingManagerOpen = val)" @goto-address="onGotoAddress" />
	</div>
</template>

<script lang="ts" setup>
/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

import { computed, inject, type Ref, ref, watch } from "vue";
import DisassemblyTable from "@/app/debugger/disassembly/DisassemblyTable.vue";
import DisassemblyToolbar from "@/app/debugger/disassembly/DisassemblyToolbar.vue";
import FormattingManager from "@/app/debugger/disassembly/FormattingManager.vue";
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
import { BRANCH_OPCODES } from "@/lib/opcodes";

const vm = inject<Ref<VirtualMachine>>("vm");

interface Props {
	address: number;
	memory: Uint8Array<ArrayBufferLike>;
	registers: EmulatorState["registers"];
}
const { address, memory, registers } = defineProps<Props>();

const isSymbolManagerOpen = ref(false);
const isFormattingManagerOpen = ref(false);

const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();
const { jumpEvent } = useDisassembly();
const { setMemoryViewAddress, setActiveTab, addJumpHistory, historyNavigationEvent, clearHistory } = useDebuggerNav();
const { settings } = useSettings();
const { formattingRules } = useFormatting();
const { symbolDict } = useSymbols();

const availableScopes: Ref<string[]> = ref([]);
const getRandomColor = () =>
	`#${Math.floor(Math.random() * 16777215)
		.toString(16)
		.padStart(6, "0")}`;
const banks = vm?.value.machineConfig.memory.banks || 1;
const totalMemory = banks * 0x10000;

watch(
	() => vm?.value,
	async (newVm) => {
		if (newVm) {
			await newVm.ready;
			availableScopes.value = newVm.getScopes(); // This now returns namespaces due to parsing change
			for (const scope of availableScopes.value) {
				if (!settings.disassembly.scopeColors[scope]) settings.disassembly.scopeColors[scope] = getRandomColor();
			}
			isFollowingPc.value = true;
			clearHistory();
		}
	},
	{ immediate: true },
);

const handleAddressClick = (address: number) => {
	setMemoryViewAddress(address);
	setActiveTab("memory");
};

const getEffectiveAddress = (line: DisassemblyLine): number | null => {
	if (!vm?.value) return null;

	switch (line.mode) {
		case "IDX": {
			const zpAddr = line.oprn;
			const pointerAddr = (zpAddr + registers.X) & 0xff;
			const lo = vm.value.readDebug(pointerAddr);
			const hi = vm.value.readDebug((pointerAddr + 1) & 0xff);
			return (hi << 8) | lo;
		}

		case "IDY": {
			const zpAddr = line.oprn;
			const lo = vm.value.readDebug(zpAddr);
			const hi = vm.value.readDebug((zpAddr + 1) & 0xff);
			const baseAddr = (hi << 8) | lo;
			return (baseAddr + registers.Y) & 0xffff;
		}
		case "ABX": {
			const base = line.oprn;
			const offset = registers.X;
			return (base + offset) & 0xffff;
		}

		case "ABY": {
			const base = line.oprn;
			const offset = registers.Y;
			return (base + offset) & 0xffff;
		}

		case "ZPX": {
			const base = line.oprn;
			const offset = registers.X;
			return (base + offset) & 0xff;
		}

		case "ZPY": {
			const base = line.oprn;
			const offset = registers.Y;
			return (base + offset) & 0xff;
		}

		case "ABS": {
			return line.oprn;
		}

		default: {
			return null;
		}
	}
};

watch(historyNavigationEvent, (event) => {
	if (event) {
		isFollowingPc.value = false;
		disassemblyStartAddress.value = event.address;
	}
});

const onToggleBreakpoint = (address: number) => {
	toggleBreakpoint({ type: "pc", address }, vm?.value);
};

const getBreakpointClass = (address: number) => {
	if (pcBreakpoints.value.has(address)) {
		return pcBreakpoints.value.get(address)
			? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" // Enabled
			: "bg-transparent border-2 border-red-500/40"; // Disabled
	}
	return "bg-gray-700 group-hover:bg-red-500/50";
};

const busState = computed(() => vm?.value?.busState ?? {});

const fullPcAddress = computed(() => {
	const bank = vm?.value?.getBank(address) ?? 0;
	return address | (bank << 16);
});

const disassemblyStartAddress = ref(fullPcAddress.value);
const disassembly = ref<DisassemblyLine[]>([]);
const isFollowingPc = ref(true);
const pcRowIndex = ref(-1);
const pivotIndex = ref(0);

const onGotoAddress = (addr: number) => {
	if (addr >= totalMemory) return;
	disassemblyStartAddress.value = addr;
	isFollowingPc.value = false;
};

const syncToPc = () => {
	isFollowingPc.value = !isFollowingPc.value;
	if (isFollowingPc.value) {
		const currentPcIndex = disassembly.value.findIndex((line) => line.addr === fullPcAddress.value);
		if (currentPcIndex !== -1) {
			pivotIndex.value = currentPcIndex;
		} else {
			pivotIndex.value = Math.floor(visibleRowCount.value / 2);
		}
	}
};

const { scrollContainer, visibleRowCount, handleScroll, scrollUp, scrollDown, pageUp, pageDown } = useDisassemblyScroll(
	vm as Ref<VirtualMachine>,
	disassembly,
	disassemblyStartAddress,
	isFollowingPc,
	pivotIndex,
);

const handleKeyDown = (event: KeyboardEvent) => {
	switch (event.key) {
		case "ArrowUp":
			scrollUp();
			break;
		case "ArrowDown":
			scrollDown();
			break;
		case "PageUp":
			pageUp();
			break;
		case "PageDown":
			pageDown();
			break;
	}
};

// useless line - used as ref in template but not seen in VSCode
// oxlint-disable-next-line no-unused-expressions
scrollContainer;

const explanation = ref(null);
const isLoading = ref(false);

const readByte = (address: number, debug = true) => {
	return (debug ? vm?.value.readDebug(address) : vm?.value.read(address)) ?? 0;
};

watch(
	// Re-disassemble when the start address or memory changes
	() => [
		disassemblyStartAddress.value,
		memory,
		visibleRowCount.value,
		busState.value,
		registers,
		formattingRules.value,
		symbolDict.value,
		isFollowingPc.value,
		fullPcAddress.value,
		pivotIndex.value,
	],
	() => {
		if (memory) {
			vm?.value?.syncBusState();

			let startAddr = disassemblyStartAddress.value;
			let pivot = 0;

			if (isFollowingPc.value) {
				startAddr = fullPcAddress.value;
				pivot = pivotIndex.value;
			}

			disassembly.value = disassemble(readByte, vm!.value.getScope(startAddr), startAddr, visibleRowCount.value, registers, pivot);

			if (isFollowingPc.value && disassembly.value.length > 0) {
				const newStart = disassembly.value[0]!.addr;
				if (disassemblyStartAddress.value !== newStart) {
					disassemblyStartAddress.value = newStart;
				}
			}

			pcRowIndex.value = disassembly.value.findIndex((line) => line.addr === fullPcAddress.value);
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
	if (BRANCH_OPCODES.has(line.opc)) {
		const currentBank = line.addr & 0xff0000;
		const newAddress = currentBank | line.oprn;

		// addJumpHistory(newAddress);
		addJumpHistory(disassemblyStartAddress.value);

		isFollowingPc.value = false;
		disassemblyStartAddress.value = newAddress;
		return;
	}

	const effectiveAddress = getEffectiveAddress(line);
	if (effectiveAddress !== null) {
		let bank = 0;
		if (vm?.value?.getScope(effectiveAddress) === "aux") {
			bank = 0x01;
		}

		setMemoryViewAddress((bank << 16) | effectiveAddress);
		setActiveTab("memory");
	}
};

const handleExplain = async () => {
	isLoading.value = true;
	explanation.value = null;

	// Use the currently displayed lines for explanation
	const codeArray = disassembly.value;

	const codeBlock = codeArray
		.map((line) => {
			const labeledOpcode = line.opc;
			const labelComment = line.comment;
			const finalComment = line.comment || (labelComment ? `; ${labelComment}` : "");

			const addr = `$${line.addr.toString(16).toUpperCase().padStart(4, "0")}`;
			const bytes = line.bytes.padEnd(6, " ");
			const op = labeledOpcode.padEnd(20, " ");

			return `${addr} ${bytes} ${op} ${finalComment}`;
		})
		.join("\n");

	await handleExplainCode(codeBlock, explanation, isLoading);
};
</script>
