<template>
	<Toaster rich-colors position="top-right" />
	<CommandInterface v-model="isCommandInterfaceOpen" />
	<ResizablePanelGroup
		v-if="vm"
		direction="horizontal"
		class="h-screen bg-gray-900 text-white"
		auto-save-id="appPanelLayout"
	>
		<ResizablePanel
			class="flex flex-col bg-white bg-[conic-gradient(#000_0_25%,#333_0_50%,#000_0_75%,#333_0_100%)] [background-size:1rem_1rem] relative"
		>
			<div class="flex items-center justify-between pr-2 bg-gray-900">
				<MachineSelector
					:machines="availableMachines"
					:selected-machine="selectedMachine"
					@machine-selected="handleMachineSelected"
					@power-cycle="handlePowerCycle"
				/>
				<div class="flex items-center space-x-2">
					<VideoControl />
					<SoundControl />
					<GamepadControl v-if="hasGamepad" />
					<MouseControl v-if="hasMouse" />
					<DiskDriveControl v-if="hasDisk" />
					<SpeedControl />

					<button
						@click="showCmdConsole = !showCmdConsole"
						class="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
						:class="{ 'text-green-400 bg-gray-800': showCmdConsole }"
						title="Toggle Log Viewer"
					>
						<ScrollText />
					</button>
				</div>
			</div>
			<canvas ref="videoCanvas" class="border" style="image-rendering: pixelated"></canvas>
			<CmdConsole :show="showCmdConsole" />
		</ResizablePanel>

		<ResizableHandle />

		<ResizablePanel>
			<ResizablePanelGroup direction="vertical" auto-save-id="debuggerPanelLayout">
				<ResizablePanel
					:default-size="41"
					class="grid grid-rows-[auto_1fr] gap-2 p-2"
					@resize="dbgTopPanelResize"
				>
					<div class="flex items-center justify-start">
						<DebuggerControls :isRunning="isRunning" />
					</div>

					<div class="grid grid-cols-[300px_300px_1fr] gap-4 min-h-0">
						<!-- Registers and Flags stacked vertically in the first column -->
						<div class="grid grid-col gap-2">
							<RegistersView :registers="registers" />
							<StatusFlagsView :registers="registers" />
						</div>

						<StackView :stackData="vm.sharedMemory" :registers="registers" />

						<!-- Stack View takes the remaining space -->
						<Tabs default-value="breakpoints" class="h-full flex flex-col min-h-0">
							<TabsList class="bg-gray-900/80 p-1 shrink-0">
								<TabsTrigger
									value="stack_trace"
									class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400"
								>
									Stack Trace
								</TabsTrigger>
								<TabsTrigger
									value="breakpoints"
									class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400"
								>
									Breakpoints
								</TabsTrigger>
								<TabsTrigger
									value="state"
									class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400"
								>
									Machine State
								</TabsTrigger>
							</TabsList>
							<TabsContent value="breakpoints" class="flex-1 min-h-0">
								<BreakpointsList />
							</TabsContent>
							<TabsContent value="stack_trace" class="flex-1 min-h-0">
								<TraceView />
							</TabsContent>
							<TabsContent value="state" class="flex-1 min-h-0">
								<MachineStateView />
							</TabsContent>
						</Tabs>
					</div>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel>
					<TogglableDisplay id="disasm-mem-view" v-model:activeTab="activeDebuggerTab">
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
import { ScrollText } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue";
import { Toaster } from "vue-sonner";
import "vue-sonner/style.css";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TogglableDisplay from "../components/TogglableDisplay.vue";
import { useMachine } from "../composables/useMachine";
import CommandInterface from "./debugger/CommandInterface.vue";
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
import BreakpointsList from "./debugger/BreakpointsList.vue";
import DebuggerControls from "./debugger/DebuggerControls.vue";
import DisassemblyView from "./debugger/disassembly/DisassemblyView.vue";
import MachineStateView from "./debugger/MachineStateView.vue";
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
import CmdConsole from "./CmdConsole.vue";

const dbgTopPanelResize = (_size: unknown) => {
	// console.log('dbgTopPanelResize resized', size);
};

const { vm, registers, selectedMachine, isRunning, videoCanvas, loadMachine } = useMachine();

const hasGamepad = computed(
	() => selectedMachine.value.inputs?.some((d) => d.type === "joystick" || d.type === "gamepad") ?? false,
);
const hasMouse = computed(() => selectedMachine.value.inputs?.some((d) => d.type === "mouse") ?? false);
const hasDisk = computed(() => selectedMachine.value.disk?.enabled);

const showCmdConsole = ref(false);

const isCommandInterfaceOpen = ref(false);
provide("isCommandInterfaceOpen", isCommandInterfaceOpen);

const handleGlobalKeydown = (e: KeyboardEvent) => {
	// console.log("keydown", e.key, "ctrl", e.ctrlKey, "shift", e.shiftKey, "alt", e.altKey, "meta", e.metaKey);
	if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
		e.preventDefault();
		isCommandInterfaceOpen.value = !isCommandInterfaceOpen.value;
	}
};

onMounted(() => window.addEventListener("keydown", handleGlobalKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleGlobalKeydown));

const { activeTab: activeDebuggerTab } = useDebuggerNav();

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
