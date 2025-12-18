<template>
  <ResizablePanelGroup direction="horizontal" class="h-screen bg-gray-900 text-white">

    <ResizablePanel>
		<canvas
			id="vm-canvas"
			class="w-full h-full object-contain"
			style="image-rendering: pixelated;"
		></canvas>
	</ResizablePanel>

    <ResizableHandle />

    <ResizablePanel>

		<ResizablePanelGroup direction="vertical">
			<ResizablePanel>
				<DebuggerControls
					:isRunning="isRunning" :controls="{ handleRunPause, handleStepInstruction, handleStepOver, handleStepOut, handleReset }"
				/>

				<div class="shrink-0 mb-6 grid grid-cols-3 gap-6">

					<!-- Registers and Flags stacked vertically in the first column (1/3) -->
					<div class="col-span-1 flex flex-col space-y-6">
						<RegisterView :registers="emulatorState.registers" :controls="controls" />
						<StatusFlagsView :registers="emulatorState.registers" :controls="controls" />
					</div>

					<!-- Stack View takes the remaining two columns (2/3) -->
					<div class="col-span-2 h-full">
						<StackView :stackData="sharedMemory" :controls="controls" :registers="emulatorState.registers" />
					</div>
				</div>
			</ResizablePanel>

		    <ResizableHandle />

			<ResizablePanel>
				<div class="flex-grow min-h-0">
					<Tabs default-value="disassembly">
						<TabsList class="bg-gray-900/80 p-1">
							<TabsTrigger value="disassembly" class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400">
								Disassembly
							</TabsTrigger>
							<TabsTrigger value="memory" class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400">
								Memory Viewer
							</TabsTrigger>
							<TabsTrigger value="breakpoints" class="data-[state=active]:bg-gray-700 data-[state=active]:text-cyan-300 text-gray-400">
								Breakpoints
							</TabsTrigger>
						</TabsList>
						<TabsContent value="disassembly">
							<DisassemblyView
								:address="emulatorState.registers.PC"
								:memory="sharedMemory"
								:registers="emulatorState.registers"
								:onExplainCode="handleExplainCode"
							/>
						</TabsContent>
						<TabsContent value="memory">
							<MemoryViewer
								:memory="sharedMemory"
								:controls="controls"
								:subscribeToUiUpdates="subscribeToUiUpdates" />
						</TabsContent>
						<TabsContent value="breakpoints">
							<BreakpointsList
								:breakpoints="emulatorState.breakpoints"
								:onRemoveBreakpoint="handleRemoveBreakpoint"
								:onAddBreakpoint="handleAddBreakpoint"
							/>
						</TabsContent>
					</Tabs>
				</div>
				</ResizablePanel>
			</ResizablePanelGroup>

	</ResizablePanel>
  </ResizablePanelGroup>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, provide, reactive, ref } from "vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ResizableHandle from './components/ui/resizable/ResizableHandle.vue';
import ResizablePanel from './components/ui/resizable/ResizablePanel.vue';
import ResizablePanelGroup from './components/ui/resizable/ResizablePanelGroup.vue';
import {
	FLAG_B_MASK,
	FLAG_C_MASK,
	FLAG_D_MASK,
	FLAG_I_MASK,
	FLAG_N_MASK,
	FLAG_V_MASK,
	FLAG_Z_MASK,
	MEMORY_OFFSET,
	MEMORY_SIZE,
	REG_A_OFFSET, REG_PC_OFFSET, REG_SP_OFFSET, REG_STATUS_OFFSET, REG_X_OFFSET, REG_Y_OFFSET, TOTAL_SHARED_BUFFER_SIZE
} from './cpu/shared-memory';
import BreakpointsList from './debugger/BreakpointsList.vue';
import DebuggerControls from './debugger/DebuggerControls.vue';
import DisassemblyView from './debugger/DisassemblyView.vue';
import MemoryViewer from './debugger/MemoryViewer.vue';
import RegisterView from './debugger/RegisterView.vue';
import StackView from './debugger/StackView.vue';
import StatusFlagsView from './debugger/StatusFlagsView.vue';
import { handleExplainCode } from "./lib/gemini.utils";
import type { Breakpoint } from "./types/breakpoint.interface";
import type { EmulatorState } from "./types/emulatorstate.interface";

	const cpuWorker = ref<Worker | null>(null);
	provide('cpuWorker', cpuWorker);

	// --- Shared Memory Setup ---
	// This buffer is shared between the main thread and the worker.
	const sharedBuffer = new SharedArrayBuffer(TOTAL_SHARED_BUFFER_SIZE);
	const sharedRegisters = new DataView(sharedBuffer, 0, MEMORY_OFFSET);
	const sharedMemory = new Uint8Array(sharedBuffer, MEMORY_OFFSET, MEMORY_SIZE);

	onMounted(() => {
		const worker = new Worker(new URL('./cpu/cpu.worker.ts', import.meta.url), { type: 'module' });
		console.log("CPU worker created.");
		cpuWorker.value = worker;

		// Send the shared buffer to the worker. This is a "transfer", not a copy.
		worker.postMessage({ command: 'init', buffer: sharedBuffer });

		// --- Initialize Memory (for demo purposes) ---
		sharedMemory.fill(0);
		"HELLO WORLD!!!".split('').forEach((char, i) => {
			sharedMemory[0x0200 + i] = char.charCodeAt(0);
		});

		// Listen for messages from the worker (e.g., for breakpoints, errors)
		worker.onmessage = (event) => {
			console.log("Message received from worker:", event.data);
		};

		// Start the UI update loop
		requestAnimationFrame(updateUiFromSharedBuffer);
	});

	// --- UI Update Subscription ---
	// Allow child components to subscribe to the animation frame loop
	const uiUpdateSubscribers = new Set<() => void>();
	const subscribeToUiUpdates = (callback: () => void) => {
		uiUpdateSubscribers.add(callback);
	};

	onUnmounted(() => {
		if (cpuWorker.value) {
			console.log("Terminating CPU worker.");
			cpuWorker.value.terminate();
		}
	});

	const updateUiFromSharedBuffer = () => {
		// This function will be called on every animation frame to update the UI
		// It reads directly from the shared buffer and updates the reactive state.
		emulatorState.registers.A = sharedRegisters.getUint8(REG_A_OFFSET);
		emulatorState.registers.X = sharedRegisters.getUint8(REG_X_OFFSET);
		emulatorState.registers.Y = sharedRegisters.getUint8(REG_Y_OFFSET);
		emulatorState.registers.SP = sharedRegisters.getUint8(REG_SP_OFFSET);
		emulatorState.registers.PC = sharedRegisters.getUint16(REG_PC_OFFSET, true);

		const status = sharedRegisters.getUint8(REG_STATUS_OFFSET);
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
			A: 0, X: 0, Y: 0, PC: 0, SP: 0,
			C: false, Z: false, I: false, D: false, B: false, V: false, N: false
		},
		breakpoints: [
			{ address: 0x0609, type: 'PC' },
			{ address: 0x0800, type: 'Write' },
			{ address: 0x01F0, type: 'Read' },
			{ address: 0x0200, type: 'Access' },
		],
	});

	type RegisterName = keyof typeof emulatorState.registers;

	const controls = {
		play: () => console.log('Worker: Run'),
		pause: () => console.log('Worker: Pause'),
		step: () => console.log('Worker: Step Instruction'),
		reset: () => console.log('Worker: Reset'),
		updateMemory: (addr: number, value: number) => {
			sharedMemory[addr] = value;
			console.log(`Worker: Update [${addr.toString(16)}] to ${value.toString(16)}`);
		},
		updateRegister: <K extends RegisterName>(reg: K, value: EmulatorState['registers'][K]) => {
			// Write directly to the shared buffer so the worker sees the change.
			// The UI will update automatically on the next animation frame.
			switch (reg) {
				case 'A':
					sharedRegisters.setUint8(REG_A_OFFSET, value as number);
					break;
				case 'X':
					sharedRegisters.setUint8(REG_X_OFFSET, value as number);
					break;
				case 'Y':
					sharedRegisters.setUint8(REG_Y_OFFSET, value as number);
					break;
				case 'SP':
					sharedRegisters.setUint8(REG_SP_OFFSET, value as number);
					break;
				case 'PC':
					sharedRegisters.setUint16(REG_PC_OFFSET, value as number, true);
					break;
			}
		},
	};

	const isRunning = ref(false);

	const handleStepInstruction = () => {
		console.log("StepInstruction");
		cpuWorker.value?.postMessage({ command: 'step' });
	};

	const handleStepOver = () => {
	};
	const handleStepOut = () => {
	};
	const handleRunPause = () => {
	};
	const handleReset = () => {
	};

	const handleRemoveBreakpoint = (_bpToRemove: Breakpoint) => {
		// emulatorState.breakpoints = emulatorState.breakpoints.filter(bp => !(bp.address === bpToRemove.address && bp.type === bpToRemove.type));
	};

	const handleAddBreakpoint = (_newBp: Breakpoint) => {
		// const exists = emulatorState.breakpoints.some(bp => bp.address === newBp.address && bp.type === newBp.type);
		// if (!exists) {
		// 	emulatorState.breakpoints.push(newBp);
		// } else {
		// 	console.warn(`Breakpoint of type ${newBp.type} already exists at $${newBp.address.toString(16).toUpperCase()}`);
		// }
	};


</script>
