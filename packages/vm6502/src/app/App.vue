<template>
  <ResizablePanelGroup v-if="vm" direction="horizontal" class="h-screen bg-gray-900 text-white" auto-save-id="appPanelLayout">

    <ResizablePanel class="flex flex-col bg-white bg-[conic-gradient(#000_0_25%,#333_0_50%,#000_0_75%,#333_0_100%)] [background-size:1rem_1rem] relative">
		<div class="flex items-center justify-between pr-2 bg-gray-900">
			<MachineSelector :machines="availableMachines" :selected-machine="selectedMachine" @machine-selected="handleMachineSelected" @power-cycle="handlePowerCycle"/>
			<div class="flex items-center space-x-2">
				<VideoControl />
				<SoundControl />
				<GamepadControl v-if="hasGamepad"/>
				<DiskDriveControl v-if="hasDisk" />
				<StatusPanel />

				<button
					@click="showLogs = !showLogs"
					class="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
					:class="{ 'text-green-400 bg-gray-800': showLogs }"
					title="Toggle Log Viewer"
				>
					<ScrollText />
				</button>
			</div>
		</div>
		<canvas
			ref="videoCanvas"
			class="border"
			style="image-rendering: pixelated;"
		></canvas>
		<div v-if="showLogs" :style="{ height: logHeight + 'px' }" class="absolute bottom-0 left-5 right-5 min-h-[100px] bg-gray-800/70 text-green-400 font-mono text-xs flex flex-col border-t border-gray-700 backdrop-blur-sm z-10">
			<!-- Resize Handle -->
			<div
				class="absolute -top-1 left-0 right-0 h-2 cursor-row-resize hover:bg-cyan-500/50 transition-colors z-20"
				@mousedown.prevent="startResizeLogs"
			></div>

			<div class="flex justify-between items-center px-2 py-1 bg-gray-800/50 border-b border-gray-700 shrink-0">
				<span class="font-bold text-gray-300 uppercase tracking-wider text-[10px]">System Logs</span>
				<button @click="logs = []" class="text-[10px] hover:text-red-400 text-gray-400 transition-colors">Clear</button>
			</div>
			<div class="flex-1 overflow-y-auto p-2 space-y-0.5">
				<div v-for="(log, i) in logs" :key="i" class="break-all border-b border-gray-800/30 pb-0.5">{{ log }}</div>
				<div ref="logEndRef"></div>
			</div>
		</div>
	</ResizablePanel>

    <ResizableHandle />

    <ResizablePanel>

		<ResizablePanelGroup direction="vertical" auto-save-id="debuggerPanelLayout">
			<ResizablePanel :default-size="41" class="grid grid-rows-[auto_1fr] gap-2 p-2" @resize="dbgTopPanelResize">
				<div class="flex items-center justify-start">
					<DebuggerControls :isRunning="isRunning" />
				</div>

				<div class="grid grid-cols-[300px_1fr] gap-4 min-h-0">

					<!-- Registers and Flags stacked vertically in the first column -->
					<div class="grid grid-col gap-2">
						<RegistersView :registers="emulatorState.registers" />
						<StatusFlagsView :registers="emulatorState.registers" />
					</div>

					<!-- Stack View takes the remaining space -->
					<Tabs default-value="stack" class="h-full flex flex-col min-h-0">
						<TabsList class="bg-gray-900/80 p-1 shrink-0">
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
						<TabsContent value="stack" class="flex-1 min-h-0">
							<StackView :stackData="vm.sharedMemory" :registers="emulatorState.registers" />
						</TabsContent>
						<TabsContent value="stack_trace" class="flex-1 min-h-0">
							<TraceView />
						</TabsContent>
						<TabsContent value="breakpoints" class="flex-1 min-h-0">
							<BreakpointsList />
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
import { computed, markRaw, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch } from "vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TogglableDisplay from '../components/TogglableDisplay.vue';
import ResizableHandle from '../components/ui/resizable/ResizableHandle.vue';
import ResizablePanel from '../components/ui/resizable/ResizablePanel.vue';
import ResizablePanelGroup from '../components/ui/resizable/ResizablePanelGroup.vue';
import { useBreakpoints } from "../composables/useBreakpoints";
import { useDebuggerNav } from "../composables/useDebuggerNav";
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
import DisassemblyView from './debugger/disassembly/DisassemblyView.vue';
import MachineStateView from "./debugger/MachineStateView.vue";
import MultiMemoryViewer from './debugger/memoryview/MultiMemoryViewer.vue';
import RegistersView from './debugger/RegistersView.vue';
import StackView from './debugger/StackView.vue';
import StatusFlagsView from './debugger/StatusFlagsView.vue';
import TraceView from './debugger/TraceView.vue';
import DiskDriveControl from "./machine/diskdrivecontrol/DiskDriveControl.vue";
import GamepadControl from "./machine/GamepadControl.vue";
import MachineSelector from './machine/MachineSelector.vue';
import SoundControl from "./machine/SoundControl.vue";
import StatusPanel from './machine/StatusPanel.vue';
import VideoControl from "./machine/VideoControl.vue";

	const dbgTopPanelResize= (_size:unknown) => {
		// console.log('dbgTopPanelResize resized', size);
	};

	const vm = ref<VirtualMachine | null>(null);
	const videoCanvas = ref<HTMLCanvasElement | null>(null);
	const selectedMachine = ref<MachineConfig>(availableMachines[1] as MachineConfig);
	const hasGamepad= computed(() => (selectedMachine.value.inputs?.length ?? 0) > 0 );
	const hasDisk= computed(() => selectedMachine.value.disk?.enabled );

	const logs = ref<string[]>([]);
	const showLogs = ref(false);
	const logEndRef = ref<HTMLDivElement | null>(null);
	const logHeight = ref(200);

	const startResizeLogs = (e: MouseEvent) => {
		const startY = e.clientY;
		const startHeight = logHeight.value;

		const onMouseMove = (e: MouseEvent) => {
			const deltaY = startY - e.clientY;
			logHeight.value = Math.max(100, startHeight + deltaY);
		};

		const onMouseUp = () => {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		};

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	};

	const { activeTab: activeDebuggerTab } = useDebuggerNav();

	provide('vm', vm);
	const { loadBreakpoints } = useBreakpoints();

	const setupVmListeners = (targetVm: VirtualMachine) => {
		targetVm.onmessage = (event) => {
			const { type, error, message } = event.data;

			switch (type) {
				case 'error':
					if (error === 'unimplemented_opcode') {
						isRunning.value = false; // Ensure UI reflects the paused state
						alert(`Emulator Halted!\n\nError: ${message}`);
					} else console.error("Error received from worker:", event.data);
					break;
				case 'isRunning':
					// Update the local isRunning ref based on the worker's state
					isRunning.value = event.data.isRunning;
					if (!isRunning.value) targetVm.refreshVideo();

					break;
				default:
					console.log("Message received from worker:", event.data);
			}
		};

		targetVm.onLog((payload) => {
			if (!payload.message) return;

			logs.value.push(payload.message);
			if (logs.value.length > 500) logs.value.shift();
			nextTick(() => {
				if (logEndRef.value) logEndRef.value.scrollIntoView({ behavior: "smooth" });
			});
		});
	};

	onMounted(() => {

		const machine= new VirtualMachine(selectedMachine.value);
		vm.value = markRaw(machine);
		loadBreakpoints(machine);
		setupVmListeners(vm.value);

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

	onUnmounted(() => {	vm.value?.terminate(); });

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
		isRunning.value = false;
		const newVm = new VirtualMachine(newMachine);
		vm.value = markRaw(newVm);
		setupVmListeners(newVm);
		if(videoCanvas.value) newVm.initVideo(videoCanvas.value);
		loadBreakpoints(newVm);
		selectedMachine.value = newMachine;
	};

	const handleMachineSelected = (newMachine: MachineConfig) => {
		if (newMachine && newMachine.name !== vm.value?.machineConfig.name) loadMachine(newMachine);
	};

	const handlePowerCycle = () => {
		if (selectedMachine.value) loadMachine(selectedMachine.value);
	};
</script>
