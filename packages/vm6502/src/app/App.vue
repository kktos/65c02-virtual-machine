<template>
	<Toaster rich-colors position="top-right" />
	<LogWindow v-for="win in logWindows.values()" :key="win.id" :window-state="win" />
	<RoutineEditor />
	<!-- Mounted here, not in the disassembly view: they must stay open when switching to the memory viewer tab -->
	<template v-if="vm">
		<SymbolManager @goto-address="gotoDisassembly" />
		<FormattingManager @goto-address="gotoDisassembly" />
	</template>
	<ResizablePanelGroup
		v-if="vm"
		direction="horizontal"
		class="h-screen bg-gray-900 text-white"
		auto-save-id="appPanelLayout"
	>
		<ResizablePanel
			class="flex flex-col bg-white bg-[conic-gradient(#000_0_25%,#333_0_50%,#000_0_75%,#333_0_100%)] [background-size:1rem_1rem] relative"
		>
			<!-- Toolbar: its width drives the @container breakpoints used inside the controls -->
			<div class="@container flex flex-wrap items-center gap-1 p-1 bg-gray-800 border-b border-gray-700">
				<MachineSelector
					class="flex-1 basis-0 min-w-17"
					:machines="availableMachines"
					:selected-machine="selectedMachine"
					@machine-selected="handleMachineSelected"
					@power-cycle="handlePowerCycle"
				/>
				<div class="hidden @[26rem]:block toolbar-sep"></div>
				<div class="flex items-center gap-0.5">
					<VideoControl />
					<SoundControl />
					<GamepadControl v-if="hasGamepad" />
					<MouseControl v-if="hasMouse" />
					<DiskDriveControl v-if="hasDisk" />
				</div>
				<div class="hidden @[26rem]:block toolbar-sep"></div>
				<SpeedControl />
			</div>
			<canvas ref="videoCanvas" class="border" style="image-rendering: pixelated"></canvas>
			<CmdConsole />
		</ResizablePanel>

		<ResizableHandle />

		<ResizablePanel>
			<ResizablePanelGroup direction="vertical" auto-save-id="debuggerPanelLayout">
				<ResizablePanel :default-size="41" class="grid grid-rows-[auto_1fr]" @resize="dbgTopPanelResize">
					<DebuggerControls :isRunning="isRunning" />

					<!--
						The panel width drives the layout (container query):
						- narrow: CPU strip (registers + flags) across the top, Stack | Trace below
						- wide (>= 54rem): 3 columns, CPU stacked vertically | Stack | Trace
						Breakpoints live in a drawer opened from the debugger toolbar.
					-->
					<div class="@container min-h-0 p-2">
						<div
							class="grid h-full gap-2 grid-cols-[16rem_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] [grid-template-areas:'cpu_cpu'_'stack_trace'] @[54rem]:grid-cols-[minmax(13rem,300px)_16rem_minmax(0,1fr)] @[54rem]:grid-rows-[minmax(0,1fr)] @[54rem]:[grid-template-areas:'cpu_stack_trace']"
						>
							<!-- Registers and flags: side by side (wrapping) when narrow, stacked when wide -->
							<div
								class="[grid-area:cpu] flex flex-wrap gap-2 min-w-0 @[54rem]:flex-col @[54rem]:flex-nowrap"
							>
								<RegistersView
									class="flex-[1_1_15rem] min-w-0 @[54rem]:flex-none"
									:registers="registers"
									:virtual-registers="virtualRegisters"
								/>
								<StatusFlagsView class="shrink-0" :registers="registers" />
							</div>

							<StackView class="[grid-area:stack] min-h-0" :registers="registers" />

							<TraceView class="[grid-area:trace] min-h-0 min-w-0" />
						</div>
					</div>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel>
					<TogglableDisplay id="disasm-mem-view" v-model:activeTab="debuggerTab">
						<template #tab1-title> Disassembly </template>
						<template #tab2-title> Memory Viewer </template>
						<template #tab1-content>
							<DisassemblyView :address="registers.PC" :memory="vm.sharedMemory" :registers="registers" />
						</template>
						<template #tab2-content>
							<MultiMemoryViewer />
						</template>
					</TogglableDisplay>
				</ResizablePanel>
			</ResizablePanelGroup>
		</ResizablePanel>
	</ResizablePanelGroup>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, watch } from "vue";
import { Toaster } from "vue-sonner";
import "vue-sonner/style.css";
import TogglableDisplay from "../components/TogglableDisplay.vue";
import { useMachine } from "../composables/useMachine";
import ResizableHandle from "../components/ui/resizable/ResizableHandle.vue";
import ResizablePanel from "../components/ui/resizable/ResizablePanel.vue";
import ResizablePanelGroup from "../components/ui/resizable/ResizablePanelGroup.vue";
import { useDebuggerNav } from "../composables/useDebuggerNav";
import { availableMachines } from "../machines";
import type { MachineConfig } from "../types/machine.interface";
import {
	FLAG_B_MASK,
	FLAG_C_MASK,
	FLAG_D_MASK,
	FLAG_I_MASK,
	FLAG_N_MASK,
	FLAG_V_MASK,
	FLAG_Z_MASK,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "../virtualmachine/cpu/shared-memory";
import DebuggerControls from "./debugger/DebuggerControls.vue";
import DisassemblyView from "./debugger/disassembly/DisassemblyView.vue";
import MultiMemoryViewer from "./debugger/memoryview/MultiMemoryViewer.vue";
import RegistersView from "./debugger/RegistersView.vue";
import StackView from "./debugger/StackView.vue";
import StatusFlagsView from "./debugger/StatusFlagsView.vue";
import TraceView from "./debugger/TraceView.vue";
import DiskDriveControl from "./machine/diskdrivecontrol/DiskDriveControl.vue";
import GamepadControl from "./machine/GamepadControl.vue";
import MachineSelector from "./machine/MachineSelector.vue";
import MouseControl from "./machine/MouseControl.vue";
import SoundControl from "./machine/SoundControl.vue";
import SpeedControl from "./machine/SpeedControl.vue";
import VideoControl from "./machine/VideoControl.vue";
import CmdConsole from "./debugger/CmdConsole.vue";
import { useCmdConsole } from "@/composables/useCmdConsole";
import { useLogWindows } from "@/composables/useLogWindows";
import LogWindow from "@/components/LogWindow.vue";
import RoutineEditor from "@/app/debugger/RoutineEditor.vue";
import FormattingManager from "@/app/debugger/FormattingManager/FormattingManager.vue";
import SymbolManager from "@/app/debugger/SymbolManager/SymbolManager.vue";
import { useDisassembly } from "@/composables/useDisassembly";

const dbgTopPanelResize = (_size: unknown) => {
	// console.log('dbgTopPanelResize resized', size);
};

const { vm, registers, selectedMachine, isRunning, videoCanvas, loadMachine, virtualRegisters } = useMachine();
const { showConsole } = useCmdConsole();
const { logWindows } = useLogWindows();

const hasGamepad = computed(
	() => selectedMachine.value.inputs?.some((d) => d.type === "joystick" || d.type === "gamepad") ?? false,
);
const hasMouse = computed(() => selectedMachine.value.inputs?.some((d) => d.type === "mouse") ?? false);
const hasDisk = computed(() => selectedMachine.value.disk?.enabled);

const handleGlobalKeydown = (e: KeyboardEvent) => {
	// console.log("keydown", e.key, "ctrl", e.ctrlKey, "shift", e.shiftKey, "alt", e.altKey, "meta", e.metaKey);
	if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
		e.preventDefault();
		showConsole();
	}
};

onMounted(() => window.addEventListener("keydown", handleGlobalKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleGlobalKeydown));

const { activeTab: activeDebuggerTab, setActiveTab } = useDebuggerNav();
/** The debugger tabs component only knows "tab1" (disassembly) and "tab2" (memory) */
const debuggerTab = computed({
	get: () => (activeDebuggerTab.value === "memory" ? "tab2" : "tab1"),
	set: (tab: "tab1" | "tab2") => setActiveTab(tab === "tab2" ? "memory" : "disassembly"),
});

const { requestJump } = useDisassembly();
const gotoDisassembly = (address: number) => {
	setActiveTab("disassembly");
	requestJump(address);
};

provide("vm", vm);

onMounted(() => {
	loadMachine(selectedMachine.value);

	// Start the UI update loop
	requestAnimationFrame(updateUiFromSharedBuffer);
});

// Wait for the canvas to be mounted by the ResizablePanel before setting it on the VM
watch(
	videoCanvas,
	(newCanvasEl) => {
		if (newCanvasEl && vm.value) vm.value.initVideo(newCanvasEl);
	},
	{ once: true },
);

// --- UI Update Subscription ---
// Allow child components to subscribe to the animation frame loop
const uiUpdateSubscribers = new Set<() => void>();
const subscribeToUiUpdates = (callback: () => void) => {
	uiUpdateSubscribers.add(callback);
};
provide("subscribeToUiUpdates", subscribeToUiUpdates);

onUnmounted(() => {
	vm.value?.terminate();
});

const updateUiFromSharedBuffer = () => {
	if (!vm.value) return requestAnimationFrame(updateUiFromSharedBuffer);
	// This function will be called on every animation frame to update the UI
	// It reads directly from the shared buffer and updates the reactive state.
	registers.A = vm.value.sharedRegisters.getUint8(REG_A_OFFSET);
	registers.X = vm.value.sharedRegisters.getUint8(REG_X_OFFSET);
	registers.Y = vm.value.sharedRegisters.getUint8(REG_Y_OFFSET);
	registers.SP = vm.value.sharedRegisters.getUint8(REG_SP_OFFSET);
	registers.PC = vm.value.sharedRegisters.getUint16(REG_PC_OFFSET, true);

	const status = vm.value.sharedRegisters.getUint8(REG_STATUS_OFFSET);
	registers.P = status;
	registers.C = (status & FLAG_C_MASK) !== 0;
	registers.Z = (status & FLAG_Z_MASK) !== 0;
	registers.I = (status & FLAG_I_MASK) !== 0;
	registers.D = (status & FLAG_D_MASK) !== 0;
	registers.B = (status & FLAG_B_MASK) !== 0;
	registers.V = (status & FLAG_V_MASK) !== 0;
	registers.N = (status & FLAG_N_MASK) !== 0;

	// Notify subscribers
	uiUpdateSubscribers.forEach((cb) => {
		cb();
	});

	// Keep the loop going
	requestAnimationFrame(updateUiFromSharedBuffer);
};

const handleMachineSelected = (newMachine: MachineConfig) => {
	if (newMachine && newMachine.name !== vm.value?.machineConfig.name) loadMachine(newMachine);
};

const handlePowerCycle = () => {
	if (selectedMachine.value) loadMachine(selectedMachine.value);
};
</script>
