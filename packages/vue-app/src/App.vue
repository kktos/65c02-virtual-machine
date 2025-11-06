
<template>
<div class="max-w-7xl mx-auto">
	<header class="mb-4 border-b border-gray-700 pb-3">
		<h1 class="text-3xl font-extrabold text-cyan-400">65C02 VM Debugger (Vue 3)</h1>
		<p class="text-gray-400 text-sm">Emulation Core: Web Worker | UI Framework: Vue 3/Tailwind</p>
	</header>

	<div id="main-container" class="flex flex-row h-[calc(100vh-120px)] overflow-hidden rounded-xl shadow-2xl border border-gray-700">

		<!-- Left Panel: Canvas -->
		<section class="p-4 flex flex-col space-y-4 bg-gray-800 transition-width duration-100" :style="{ width: splitWidth + '%' }">
			<div class="flex-grow flex flex-col min-h-0 space-y-4">
				<div class="flex-grow bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center relative">
					<canvas
						id="vm-canvas"
						class="w-full h-full object-contain"
						style="image-rendering: pixelated;"
					></canvas>
					<span class="absolute text-2xl text-green-500 font-mono opacity-20 pointer-events-none">VM Output</span>
				</div>
			</div>
		</section>

		<!-- Separator -->
		<div
			class="w-2 cursor-col-resize bg-gray-700 hover:bg-cyan-500 transition duration-150 relative group"
			@mousedown="handleMouseDown"
		>
			<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-gray-500 rounded-full group-hover:bg-cyan-300 transition-colors"></div>
		</div>

		<!-- Right Panel: Debugger Components -->
		<section class="flex-grow bg-gray-900 flex flex-col p-4 overflow-hidden">

			<!-- 0. Debugger Controls at the Top (NEW LOCATION) -->
			<DebuggerControls
				:isRunning="isRunning"
				:handleRunPause="handleRunPause"
				:handleStepInstruction="handleStepInstruction"
				:handleStepOver="handleStepOver"
				:handleStepOut="handleStepOut"
				:handleReset="handleReset"
			/>

			<!-- 1. Top Section: Registers and Stack side-by-side -->
			<div class="shrink-0 mb-6 grid grid-cols-3 gap-6">

				<!-- Registers and Flags stacked vertically in the first column (1/3) -->
				<div class="col-span-1 flex flex-col space-y-6">
					<RegisterView :registers="emulatorState.registers" :controls="controls" />
					<StatusFlagsView :registers="emulatorState.registers" :controls="controls" />
				</div>

				<!-- Stack View takes the remaining two columns (2/3) -->
				<div class="col-span-2 h-full">
					<StackView :stackData="emulatorState.memory" :controls="controls" :registers="emulatorState.registers" />
				</div>
			</div>

			<!-- 2. Bottom Section: Tabbed Panel -->
			<div class="flex-grow min-h-0">
				<BottomTabPanel :activeTab="activeTab" :setActiveTab="setActiveTab">
					<template #disassembly>
						<DisassemblyView
							:disassembly="emulatorState.disassembly"
							:PC="emulatorState.registers.PC"
							:registers="emulatorState.registers"
							:onExplainCode="handleExplainCode"
						/>
					</template>
					<template #memory>
						<MemoryViewer :memory="emulatorState.memory" :controls="controls" />
					</template>
					<template #breakpoints>
						<BreakpointsList
							:breakpoints="emulatorState.breakpoints"
							:onRemoveBreakpoint="handleRemoveBreakpoint"
							:onAddBreakpoint="handleAddBreakpoint"
						/>
					</template>
				</BottomTabPanel>
			</div>
		</section>
	</div>

</div>
</template>

<script lang="ts" setup>
/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

	import { reactive, ref } from "vue";

	const isRunning = ref(false);
	// --- Split View State ---
	const splitWidth = ref(60); // Percentage width of the left panel (Canvas)
	const MIN_SPLIT_WIDTH = 40;
	const MAX_SPLIT_WIDTH = 80;

	const emulatorState = reactive({
		registers: {
			A: 0x42, X: 0x01, Y: 0x02,
			PC: 0x0609, 
			SP: 0xF9, // Stack Pointer set to $F9
			C: true, Z: false, I: true, D: false, B: false, V: false, N: false
		},
		memory: Array(0x10000).fill(0).map((_, i) => {
			if (i >= 0x0200 && i < 0x0210) return "HELLO WORLD!!!".charCodeAt(i - 0x0200) || 0;
			return (i % 256);
		}),
		disassembly: [
			{ address: 0x05FC, opcode: "LDA #$10", cycles: 2, rawBytes: "A9 10", comment: "Load character code" },
			{ address: 0x05FE, opcode: "JMP $FCE2", cycles: 3, rawBytes: "4C E2 FC", comment: "Jump to core handler" },
			{ address: 0x0600, opcode: "JSR $FCE2", cycles: 6, rawBytes: "20 E2 FC", comment: "Call initialization routine" },
			{ address: 0x0603, opcode: "LDX #$A0", cycles: 2, rawBytes: "A2 A0", comment: "Set loop counter (160 iterations)" },
			{ address: 0x0605, opcode: "STA $0200,X", cycles: 4, rawBytes: "9D 00 02", comment: "Write A to memory" }, 
			{ address: 0x0608, opcode: "DEX", cycles: 2, rawBytes: "CA", comment: "Decrement counter X" },
			{ address: 0x0609, opcode: "BNE $0605", cycles: 3, rawBytes: "D0 FB", comment: "Loop if X != 0 (Z is clear)" }, 
			{ address: 0x060B, opcode: "LDA $C000", cycles: 6, rawBytes: "AD 00 C0", comment: "Poll keyboard status" }, 
			{ address: 0x060E, opcode: "NOP", cycles: 2, rawBytes: "EA", comment: "" },
			{ address: 0x060F, opcode: "INC $02", cycles: 5, rawBytes: "E6 02", comment: "Increment Zero Page variable" },
			{ address: 0x0611, opcode: "EOR $0400", cycles: 5, rawBytes: "4D 00 04", comment: "XOR with screen byte" }, 
			{ address: 0x0614, opcode: "CMP #$00", cycles: 2, rawBytes: "C9 00", comment: "Compare A with zero" },
			{ address: 0x0616, opcode: "BEQ $0600", cycles: 3, rawBytes: "F0 E8", comment: "Branch if Equal (Z is set)" },
		],
		breakpoints: [
			{ address: 0x0609, type: 'PC' }, 
			{ address: 0x0800, type: 'Write' },
			{ address: 0x01F0, type: 'Read' },
			{ address: 0x0200, type: 'Access' },
		],
	});

	// --- Mock Controls/Worker ---
	const controls = {
		play: () => console.log('Worker: Run'),
		pause: () => console.log('Worker: Pause'),
		step: () => console.log('Worker: Step Instruction'),
		reset: () => console.log('Worker: Reset'),
		updateMemory: (addr:number, value:number) => {
			emulatorState.memory[addr] = value; // Immediate update for demo
			console.log(`Worker: Update [${addr.toString(16)}] to ${value.toString(16)}`);
		},
		updateRegister: (reg:string, value:number) => {
			emulatorState.registers[reg] = value;
			console.log(`Worker: Update Register ${reg} to ${value.toString(16)}`);
		},
	};

 // --- Handlers ---
            const handleRunPause = () => {
                if (isRunning.value) {
                    controls.pause();
                } else {
                    controls.play();
                }
                isRunning.value = !isRunning.value;
            };

            const handleStepInstruction = () => {
                controls.step();
                // Mock state update
                emulatorState.registers.PC += (isRunning.value ? 0 : 3);
                emulatorState.registers.X = emulatorState.registers.X === 0 ? 0 : emulatorState.registers.X - 1;
                emulatorState.registers.Z = emulatorState.registers.X === 0;
            };

            const handleStepOver = () => {
                console.log("Control: Step Over command sent (MOCK).");
            };

            const handleStepOut = () => {
                console.log("Control: Step Out command sent (MOCK).");
            };

            const handleReset = () => {
                controls.reset();
                isRunning.value = false;
                // Reset to default
                emulatorState.registers.A = 0x00;
                emulatorState.registers.X = 0x00;
                emulatorState.registers.Y = 0x00;
                emulatorState.registers.PC = 0xC000;
                emulatorState.registers.SP = 0xFF;
                emulatorState.registers.C = false;
                emulatorState.registers.Z = false;
                emulatorState.registers.I = false;
                emulatorState.registers.D = false;
                emulatorState.registers.B = false;
                emulatorState.registers.V = false;
                emulatorState.registers.N = false;
            };

            const handleRemoveBreakpoint = (bpToRemove) => {
                emulatorState.breakpoints = emulatorState.breakpoints.filter(bp => !(bp.address === bpToRemove.address && bp.type === bpToRemove.type));
            };

            const handleAddBreakpoint = (newBp) => {
                const exists = emulatorState.breakpoints.some(bp => bp.address === newBp.address && bp.type === newBp.type);
                if (!exists) {
                    emulatorState.breakpoints.push(newBp);
                } else {
                    console.warn(`Breakpoint of type ${newBp.type} already exists at $${newBp.address.toString(16).toUpperCase()}`);
                }
            };

            // --- LLM Handler (Code Explanation) ---
            const handleExplainCode = async (codeBlock, setExplanation, setIsLoading) => {
                const systemPrompt = "You are a world-class 6502 CPU reverse engineer and assembly language expert. Analyze the provided block of 6502 assembly code and provide a concise, single-paragraph explanation of its overall purpose and function, focusing on the high-level logic (e.g., 'This loop copies X bytes from address A to address B').";
                const userQuery = `Analyze this 6502 assembly code block and explain its function: \n\n${codeBlock}`;

                const payload = {
                    contents: [{ parts: [{ text: userQuery }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                };

                try {
                    const result = await retryFetch(GEMINI_API_URL, {
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


            // --- Split View Logic ---
            const handleMouseMove = (e: MouseEvent) => {
                const container = document.getElementById('main-container');
                if (!container) return;

                const newWidthPx = e.clientX - container.offsetLeft;
                const totalWidthPx = container.clientWidth;
                const newWidthPercent = (newWidthPx / totalWidthPx) * 100;

                if (newWidthPercent >= MIN_SPLIT_WIDTH && newWidthPercent <= MAX_SPLIT_WIDTH) {
                    splitWidth.value = newWidthPercent;
                }
            };

            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';
            };

            const handleMouseDown = (e: Event) => {
                e.preventDefault();
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            };

</script>
