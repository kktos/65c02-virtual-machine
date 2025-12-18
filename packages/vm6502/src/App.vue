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
import type { Breakpoint } from "./types/breakpoint.interface";
import type { EmulatorState } from "./types/emulatorstate.interface";

	// --- LLM Constants and Utilities (Outside Vue component definitions) ---
	const API_KEY = "";
	const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;

	const cpuWorker = ref<Worker | null>(null);
	provide('cpuWorker', cpuWorker);

	// --- Shared Memory Setup ---
	// This buffer is shared between the main thread and the worker.
	const sharedBuffer = new SharedArrayBuffer(TOTAL_SHARED_BUFFER_SIZE);
	const sharedRegisters = new DataView(sharedBuffer, 0, MEMORY_OFFSET);
	const sharedMemory = new Uint8Array(sharedBuffer, MEMORY_OFFSET, MEMORY_SIZE);

	onMounted(() => {
		const worker = new Worker(new URL('./cpu/cpu.worker.ts', import.meta.url), {
			type: 'module',
		});
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
		// disassembly: [
		// 	{ address: 0x05FC, opcode: "LDA #$10", cycles: 2, rawBytes: "A9 10", comment: "Load character code" },
		// 	{ address: 0x05FE, opcode: "JMP $FCE2", cycles: 3, rawBytes: "4C E2 FC", comment: "Jump to core handler" },
		// 	{ address: 0x0600, opcode: "JSR $FCE2", cycles: 6, rawBytes: "20 E2 FC", comment: "Call initialization routine" },
		// 	{ address: 0x0603, opcode: "LDX #$A0", cycles: 2, rawBytes: "A2 A0", comment: "Set loop counter (160 iterations)" },
		// 	{ address: 0x0605, opcode: "STA $0200,X", cycles: 4, rawBytes: "9D 00 02", comment: "Write A to memory" },
		// 	{ address: 0x0608, opcode: "DEX", cycles: 2, rawBytes: "CA", comment: "Decrement counter X" },
		// 	{ address: 0x0609, opcode: "BNE $0605", cycles: 3, rawBytes: "D0 FB", comment: "Loop if X != 0 (Z is clear)" },
		// 	{ address: 0x060B, opcode: "LDA $C000", cycles: 6, rawBytes: "AD 00 C0", comment: "Poll keyboard status" },
		// 	{ address: 0x060E, opcode: "NOP", cycles: 2, rawBytes: "EA", comment: "" },
		// 	{ address: 0x060F, opcode: "INC $02", cycles: 5, rawBytes: "E6 02", comment: "Increment Zero Page variable" },
		// 	{ address: 0x0611, opcode: "EOR $0400", cycles: 5, rawBytes: "4D 00 04", comment: "XOR with screen byte" },
		// 	{ address: 0x0614, opcode: "CMP #$00", cycles: 2, rawBytes: "C9 00", comment: "Compare A with zero" },
		// 	{ address: 0x0616, opcode: "BEQ $0600", cycles: 3, rawBytes: "F0 E8", comment: "Branch if Equal (Z is set)" },
		// ],
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
			sharedMemory[addr] = value; // Write directly to the shared buffer
			console.log(`Worker: Update [${addr.toString(16)}] to ${value.toString(16)}`);
		},
		updateRegister: <K extends RegisterName>(reg: K, value: EmulatorState['registers'][K]) => {
			emulatorState.registers[reg] = value; // This is now type-safe!
			console.log(`Worker: Update Register ${reg} to ${value.toString(16)}`);
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

    // --- LLM Handler (Code Explanation) ---
	const handleExplainCode = async (codeBlock: string, setExplanation, setIsLoading) => {
		const systemPrompt = "You are a world-class 6502 CPU reverse engineer and assembly language expert. Analyze the provided block of 6502 assembly code and provide a concise, single-paragraph explanation of its overall purpose and function, focusing on the high-level logic (e.g., 'This loop copies X bytes from address A to address B').";
		const userQuery = `Analyze this 6502 assembly code block and explain its function: \n\n${codeBlock}`;

		const payload = {
			contents: [{ parts: [{ text: userQuery }] }],
			systemInstruction: { parts: [{ text: systemPrompt }] },
		};

		try {
			const result = await fetch(GEMINI_API_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
			if (text) {
				setExplanation.value = text;
			} else {
				setExplanation.value = "Could not retrieve explanation. API response was empty or malformed.";
			}
		} catch (error) {
			console.error("Gemini API Error:", error);
			setExplanation.value = "Error: Failed to connect to the analysis engine.";
		} finally {
			setIsLoading.value = false;
		}
	};
</script>
