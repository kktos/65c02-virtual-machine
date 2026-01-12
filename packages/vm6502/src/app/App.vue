<template>
  <ResizablePanelGroup v-if="vm" direction="horizontal" class="h-screen bg-gray-900 text-white" auto-save-id="appPanelLayout">

    <ResizablePanel class="flex flex-col bg-white bg-[conic-gradient(#000_0_25%,#333_0_50%,#000_0_75%,#333_0_100%)] [background-size:1rem_1rem]">
		<div class="flex items-center justify-between pr-2 bg-gray-900">
			<MachineSelector :machines="availableMachines" :selected-machine="selectedMachine" @machine-selected="handleMachineSelected" @power-cycle="handlePowerCycle"/>
			<div class="flex items-center space-x-2">
				<VideoControl />
				<DiskDriveControl />
				<StatusPanel />
			</div>
		</div>
		<canvas
			ref="videoCanvas"
			class="border"
			style="image-rendering: pixelated;"
		></canvas>
	</ResizablePanel>

    <ResizableHandle />

    <ResizablePanel>

		<ResizablePanelGroup direction="vertical" auto-save-id="debuggerPanelLayout">
			<ResizablePanel :default-size="41" class="grid gap-1" @resize="dbgTopPanelResize">
				<div class="flex items-center justify-start pr-2">
					<DebuggerControls :isRunning="isRunning" />
				</div>

				<div class="grid grid-cols-[300px_1fr] gap-4 h-full ml-4 mr-4">

					<!-- Registers and Flags stacked vertically in the first column -->
					<div class="grid grid-col gap-2">
						<RegistersView :registers="emulatorState.registers" />
						<StatusFlagsView :registers="emulatorState.registers" />
					</div>

					<!-- Stack View takes the remaining space -->
					<Tabs default-value="stack" class="h-full">
						<TabsList class="bg-gray-900/80 p-1">
							<TabsTrigger value="stack" class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400">
								Stack
							</TabsTrigger>
							<TabsTrigger value="stack_trace" class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400">
								Stack Trace
							</TabsTrigger>
							<TabsTrigger value="breakpoints" class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400">
								Breakpoints
							</TabsTrigger>
							<TabsTrigger value="state" class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400">
								Machine State
							</TabsTrigger>
						</TabsList>
						<TabsContent value="stack" class="h-full">
							<StackView :stackData="vm.sharedMemory" :registers="emulatorState.registers" />
						</TabsContent>
						<TabsContent value="stack_trace" class="h-full">
							<TraceView />
						</TabsContent>
						<TabsContent value="breakpoints" class="h-full">
							<BreakpointsList />
						</TabsContent>
						<TabsContent value="state" class="h-full">
							<MachineStateView />
						</TabsContent>
					</Tabs>
				</div>
			</ResizablePanel>

		    <ResizableHandle />

			<ResizablePanel>
					<TogglableDisplay id="disasm-mem-view">
						<template #tab1-title>
								Disassembly
						</template>
						<template #tab2-title>
								Memory Viewer
						</template>
						<template #tab1-content>
							<DisassemblyView
								:address="emulatorState.registers.PC"
								:memory="vm.sharedMemory"
								:registers="emulatorState.registers"
							/>
						</template>
						<template #tab2-content>
							<MemoryViewer />
						</template>
					</TogglableDisplay>
				</ResizablePanel>
			</ResizablePanelGroup>

	</ResizablePanel>
  </ResizablePanelGroup>
</template>

<script setup lang="ts">
import { markRaw, onMounted, onUnmounted, provide, reactive, ref, watch } from "vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TogglableDisplay from '../components/TogglableDisplay.vue';
import ResizableHandle from '../components/ui/resizable/ResizableHandle.vue';
import ResizablePanel from '../components/ui/resizable/ResizablePanel.vue';
import ResizablePanelGroup from '../components/ui/resizable/ResizablePanelGroup.vue';
import { useBreakpoints } from "../composables/useBreakpoints";
import { availableMachines } from "../machines";
import type { EmulatorState } from "../types/emulatorstate.interface";
import type { MachineConfig } from "../types/machine.interface";
import {
	FLAG_B_MASK,
	FLAG_C_MASK,
	FLAG_D_MASK,
	FLAG_I_MASK,
	FLAG_N_MASK,
	FLAG_V_MASK,
	FLAG_Z_MASK, REG_A_OFFSET, REG_PC_OFFSET, REG_SP_OFFSET, REG_STATUS_OFFSET, REG_X_OFFSET, REG_Y_OFFSET
} from '../virtualmachine/cpu/shared-memory';
import { VirtualMachine } from "../virtualmachine/virtualmachine.class";
import BreakpointsList from './debugger/BreakpointsList.vue';
import DebuggerControls from './debugger/DebuggerControls.vue';
import DisassemblyView from './debugger/DisassemblyView.vue';
import MachineStateView from "./debugger/MachineStateView.vue";
import MemoryViewer from './debugger/MemoryViewer.vue';
import RegistersView from './debugger/RegistersView.vue';
import StackView from './debugger/StackView.vue';
import StatusFlagsView from './debugger/StatusFlagsView.vue';
import TraceView from './debugger/TraceView.vue';
import DiskDriveControl from "./machine/DiskDriveControl.vue";
import MachineSelector from './machine/MachineSelector.vue';
import StatusPanel from './machine/StatusPanel.vue';
import VideoControl from "./machine/VideoControl.vue";

	const dbgTopPanelResize= (_size:unknown) => {
		// console.log('dbgTopPanelResize resized', size);
	};

	const cpuWorker = ref<Worker | null>(null);
	const vm = ref<VirtualMachine | null>(null);
	const videoCanvas = ref<HTMLCanvasElement | null>(null);
	const selectedMachine = ref<MachineConfig>(availableMachines[1] as MachineConfig);

	provide('vm', vm);
	const { loadBreakpoints } = useBreakpoints();

	onMounted(() => {

		const machine= new VirtualMachine(selectedMachine.value);
		vm.value = markRaw(machine);
		loadBreakpoints(machine);

		cpuWorker.value = vm.value.worker; // Provide worker for legacy reasons if needed

		// Listen for messages from the worker (e.g., for breakpoints, errors)
		vm.value.onmessage = (event) => {
			const { type, error, message } = event.data;
			if (type === 'error' && error === 'unimplemented_opcode') {
				isRunning.value = false; // Ensure UI reflects the paused state
				alert(`Emulator Halted!\n\nError: ${message}`);
			} else if (type === 'isRunning') {
				// Update the local isRunning ref based on the worker's state
				isRunning.value = event.data.isRunning;
			} else {
				console.log("Message received from worker:", event.data);
			}
		};

		// Start the UI update loop
		requestAnimationFrame(updateUiFromSharedBuffer);

		vm.value.ready.then(()=>{
			vm.value?.initAudio();
		});

	});

	// Wait for the canvas to be mounted by the ResizablePanel before setting it on the VM
	watch(videoCanvas, (newCanvasEl) => {
		if (newCanvasEl && vm.value)
			vm.value.initVideo(newCanvasEl);
	}, { once: true });

	// --- UI Update Subscription ---
	// Allow child components to subscribe to the animation frame loop
	const uiUpdateSubscribers = new Set<() => void>();
	const subscribeToUiUpdates = (callback: () => void) => {
		uiUpdateSubscribers.add(callback);
	};
	provide("subscribeToUiUpdates", subscribeToUiUpdates);

	onUnmounted(() => {
		if (cpuWorker.value) {
			vm.value?.terminate();
		}
	});

	const updateUiFromSharedBuffer = () => {
		if (!vm.value) return requestAnimationFrame(updateUiFromSharedBuffer);
		// This function will be called on every animation frame to update the UI
		// It reads directly from the shared buffer and updates the reactive state.
		emulatorState.registers.A = vm.value.sharedRegisters.getUint8(REG_A_OFFSET);
		emulatorState.registers.X = vm.value.sharedRegisters.getUint8(REG_X_OFFSET);
		emulatorState.registers.Y = vm.value.sharedRegisters.getUint8(REG_Y_OFFSET);
		emulatorState.registers.SP = vm.value.sharedRegisters.getUint8(REG_SP_OFFSET);
		emulatorState.registers.PC = vm.value.sharedRegisters.getUint16(REG_PC_OFFSET, true);

		const status = vm.value.sharedRegisters.getUint8(REG_STATUS_OFFSET);
		emulatorState.registers.P = status;
		emulatorState.registers.C = (status & FLAG_C_MASK) !== 0;
		emulatorState.registers.Z = (status & FLAG_Z_MASK) !== 0;
		emulatorState.registers.I = (status & FLAG_I_MASK) !== 0;
		emulatorState.registers.D = (status & FLAG_D_MASK) !== 0;
		emulatorState.registers.B = (status & FLAG_B_MASK) !== 0;
		emulatorState.registers.V = (status & FLAG_V_MASK) !== 0;
		emulatorState.registers.N = (status & FLAG_N_MASK) !== 0;

		// Notify subscribers
		uiUpdateSubscribers.forEach(cb => {cb()});

		// Keep the loop going
		requestAnimationFrame(updateUiFromSharedBuffer);
	}

	const emulatorState:EmulatorState = reactive({
		registers: {
			A: 0, X: 0, Y: 0, PC: 0, SP: 0, P: 0,
			C: false, Z: false, I: false, D: false, B: false, V: false, N: false
		},
	});

	const isRunning = ref(false);

	const loadMachine = (newMachine: MachineConfig) => {
		console.log(`Main: Loading machine ${newMachine.name}`);
		vm.value?.terminate();
		vm.value = markRaw(new VirtualMachine(newMachine));
		if(videoCanvas.value) vm.value.initVideo(videoCanvas.value);
		cpuWorker.value = vm.value.worker;
		selectedMachine.value = newMachine;
	};

	const handleMachineSelected = (newMachine: MachineConfig) => {
		if (newMachine && newMachine.name !== vm.value?.machineConfig.name) {
			loadMachine(newMachine);
		}
	};

	const handlePowerCycle = () => {
		if (selectedMachine.value) {
			loadMachine(selectedMachine.value);
		}
	};
</script>
