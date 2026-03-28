<template>
	<!-- This anchor div holds the component's place in the layout -->
	<div class="h-full w-full relative">
		<Teleport to="body" :disabled="!isMaximized">
			<div :class="containerClasses" ref="scrollContainer">
				<!-- Header combining title, count, and action button -->
				<DisassemblyToolbar
					:is-following-pc="isFollowingPc"
					:has-disassembly="!!(disassembly && disassembly.length > 0)"
					:available-scopes="availableScopes"
					:is-maximized="isMaximized"
					:has-selection="hasSelection"
					:is-settings-open="isSettingsOpen"
					ref="toolbarInstance"
					@toggle-maximize="isMaximized = !isMaximized"
					@sync-to-pc="syncToPc"
					@goto-address="gotoAddress"
					@toggle-settings="isSettingsOpen = !isSettingsOpen"
				/>

				<!-- Scrollable disassembly table -->
				<div
					ref="disassemblyContainer"
					class="font-mono text-xs overflow-y-hidden flex-grow min-h-0 bg-gray-900 p-2 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-500"
					tabindex="0"
					@wheel.prevent="handleScroll"
					@keydown="handleKeyDown"
				>
					<p v-if="!disassembly || disassembly.length === 0" class="text-gray-500 italic p-4 text-center">
						Disassembly data is empty or unavailable. (Check console for debug logs)
					</p>
					<div class="grid grid-rows-[400px_1fr]" style="grid-template-rows: auto" v-else>
						<div class="min-h-0 overflow-y-auto">
							<DisasmTable
								:lines="disassembly"
								:address="fullPcAddress"
								:registers="registers"
								@cell-click="onCellClick"
							/>
						</div>
						<div class="min-h-0 overflow-y-auto" style="display: none">
							<!-- <DisassemblyTable
								:registers="registers"
								:disassembly="disassembly"
								:address="fullPcAddress"
								:get-breakpoint-class="getBreakpointClass"
								:selection-start="selectionStart"
								:selection-end="selectionEnd"
								@toggle-breakpoint="onToggleBreakpoint"
								@address-click="handleAddressClick"
								@opcode-click="handleOpcodeClick"
								@set-selection-start="(addr) => (selectionStart = addr)"
								@set-selection-end="(addr) => (selectionEnd = addr)"
							/> -->
						</div>
					</div>
				</div>
				<DisasmSelectionStatus v-if="hasSelection" />
			</div>
			<DisassemblySettingsPanel
				:is-open="isSettingsOpen"
				:available-scopes="availableScopes"
				:ignore-ref="toolbarInstance?.settingsBtnRef"
				@close="isSettingsOpen = false"
			/>
		</Teleport>
	</div>
	<SymbolManager @goto-address="gotoAddress" />
	<FormattingManager @goto-address="gotoAddress" />
	<ExplanationDrawer
		v-model:open="isExplanationOpen"
		:explanation="explanationText"
		:is-loading="isExplainLoading"
		@save-as-note="saveExplanationAsNote"
	/>
</template>

<script lang="ts" setup>
import { computed, inject, type Ref, ref, watch } from "vue";
import DisassemblyToolbar from "@/app/debugger/disassembly/DisassemblyToolbar.vue";
import DisassemblySettingsPanel from "@/app/debugger/disassembly/settings/DisassemblySettingsPanel.vue";
import FormattingManager from "@/app/debugger/FormattingManager/FormattingManager.vue";
import SymbolManager from "@/app/debugger/SymbolManager/SymbolManager.vue";
import ExplanationDrawer from "@/app/debugger/disassembly/ExplanationDrawer.vue";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useDisassembly } from "@/composables/useDisassembly";
import { useDisassemblyScroll } from "@/composables/useDisassemblyScroll";
import { useFormatting } from "@/composables/useDataFormattings";
import { useSettings } from "@/composables/useSettings";
import { useGemini } from "@/composables/useGemini";
import { useSymbols } from "@/composables/useSymbols";
import { useNotes } from "@/composables/useNotes";
import { disassemble, disassembleRange, formatDisassemblyAsText } from "@/lib/disassembler";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { BRANCH_OPCODES } from "@/lib/opcodes";
import { getRandomColor } from "@/lib/colors.utils";
import { useAddressHistory } from "@/composables/useAddressHistory";
import DisasmTable from "./table/DisasmTable.vue";
import { useDisasmSelection } from "@/composables/useDisasmSelection";
import DisasmSelectionStatus from "./DisasmSelectionStatus.vue";
import { useComments } from "@/composables/useComments";

const vm = inject<Ref<VirtualMachine>>("vm");

interface Props {
	address: number;
	memory: Uint8Array<ArrayBufferLike>;
	registers: EmulatorRegisters;
}
const { address, memory, registers } = defineProps<Props>();

const isMaximized = ref(false);

const containerClasses = computed(() => {
	if (isMaximized.value) return "fixed inset-0 bg-gray-900 z-50 flex flex-col p-4 border border-cyan-500";
	// Classes for inline mode
	return "p-4 bg-gray-800 rounded-lg shadow-xl h-full flex flex-col relative";
});

watch(isMaximized, (isMax) => {
	if (isMax) window.dispatchEvent(new Event("resize"));
});

const { jumpEvent } = useDisassembly();
const { setMemoryViewAddress, setActiveTab } = useDebuggerNav();
const { addJumpHistory, historyNavigationEvent, clearHistory } = useAddressHistory("disassembly");
const { settings } = useSettings();
const { formattingState } = useFormatting();
const { explanation: explanationText, isLoading: isExplainLoading, explainCode } = useGemini();
const { symbolsState } = useSymbols();
const { addNote } = useNotes();
const { comments } = useComments();

const isSettingsOpen = ref(false);
const toolbarInstance = ref<InstanceType<typeof DisassemblyToolbar> | null>(null);

const availableScopes: Ref<string[]> = ref([]);
const banks = vm?.value.machineConfig.memory.banks || 1;
const totalMemory = banks * 0x10000;

watch(
	() => vm?.value,
	async (newVm) => {
		if (!newVm) return;
		await newVm.ready;
		availableScopes.value = newVm.getScopes(); // This now returns namespaces due to parsing change
		for (const scope of availableScopes.value) {
			if (!settings.disassembly.scopeColors[scope]) settings.disassembly.scopeColors[scope] = getRandomColor();
		}
		isFollowingPc.value = true;
		clearHistory();
	},
	{ immediate: true },
);

// Event Handling

const onCellClick = (col: string, line: DisassemblyLine) => {
	if (col === "addr") {
		handleAddressClick(line.addr);
		return;
	} else if (col === "opc") handleOpcodeClick(line);
};

const handleAddressClick = (address: number) => {
	setMemoryViewAddress(address);
	setActiveTab("memory");
};

const handleOpcodeClick = (line: DisassemblyLine) => {
	if (BRANCH_OPCODES.has(line.opc.toUpperCase())) {
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
	if (!event) return;
	isFollowingPc.value = false;
	disassemblyStartAddress.value = event.address;
});

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

const { startSelectionAddr, endSelectionAddr } = useDisasmSelection();
const selectionStart = ref<number | null>(null);
const selectionEnd = ref<number | null>(null);
// const hasSelection = computed(() => selectionStart.value !== null && selectionEnd.value !== null);
const hasSelection = computed(() => startSelectionAddr.value !== null && endSelectionAddr.value !== null);

const gotoAddress = (addr: number) => {
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
	if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

	switch (event.key) {
		case "ArrowUp":
			event.preventDefault();
			scrollUp();
			break;
		case "ArrowDown":
			event.preventDefault();
			scrollDown();
			break;
		case "PageUp":
			event.preventDefault();
			pageUp();
			break;
		case "PageDown":
			event.preventDefault();
			pageDown();
			break;
	}
};

// useless line - used as ref in template but not seen in VSCode
// oxlint-disable-next-line no-unused-expressions
scrollContainer;

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
		formattingState.value,
		symbolsState.value,
		comments,
		isFollowingPc.value,
		fullPcAddress.value,
		pivotIndex.value,
		settings.disassembly.lowercase,
	],
	async () => {
		if (memory) {
			vm?.value?.syncBusState();

			let startAddr = disassemblyStartAddress.value;
			let pivot = 0;

			if (isFollowingPc.value) {
				startAddr = fullPcAddress.value;
				pivot = pivotIndex.value;
			}

			disassembly.value = await disassemble({
				readByte,
				scope: vm!.value.getScope(startAddr),
				fromAddress: startAddr,
				lineCount: visibleRowCount.value,
				registers,
				pivotLineIndex: pivot,
				lowercase: settings.disassembly.lowercase,
			});

			if (isFollowingPc.value && disassembly.value.length > 0) {
				const newStart = disassembly.value[0]!.addr;
				if (disassemblyStartAddress.value !== newStart) disassemblyStartAddress.value = newStart;
			}

			pcRowIndex.value = disassembly.value.findIndex((line) => line.addr === fullPcAddress.value);
		}
	},
	{ immediate: true, deep: true },
);

// Watch for external jump requests (e.g. from TraceView)
watch(jumpEvent, (event) => {
	if (event) gotoAddress(event.address);
});

const isExplanationOpen = ref(false);

watch(explanationText, (val) => {
	if (val) isExplanationOpen.value = true;
});

const clearSelection = () => {
	selectionStart.value = null;
	selectionEnd.value = null;
};

const saveExplanationAsNote = () => {
	if (explanationText.value) {
		const startAddr = selectionStart.value ?? disassemblyStartAddress.value;
		const scope = vm?.value?.getScope(startAddr) ?? "";
		addNote(startAddr, scope, explanationText.value);
		explanationText.value = "";
	}
	isExplanationOpen.value = false;
	clearSelection();
};

const handleExplain = async () => {
	let codeBlock = "";

	if (hasSelection.value) {
		const start = selectionStart.value!;
		const end = selectionEnd.value!;
		const lines = await disassembleRange({
			readByte,
			scope: vm!.value.getScope(start),
			fromAddress: start,
			toAddress: end,
			registers,
			lowercase: settings.disassembly.lowercase,
		});
		codeBlock = formatDisassemblyAsText(lines);
	} else {
		codeBlock = formatDisassemblyAsText(disassembly.value);
	}

	await explainCode(codeBlock);
};
</script>
