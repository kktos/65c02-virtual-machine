<template>
	<div class="flex justify-start items-center space-x-4 mb-6 p-3 bg-gray-800 rounded-xl shadow-inner border border-gray-700 shrink-0">
		
		<!-- Run / Pause / Stop -->
		<button
			@click="handleRunPause"
			:class="['flex items-center space-x-1 text-sm px-3 py-1.5 rounded-lg font-semibold transition duration-200 shadow-md whitespace-nowrap', isRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500', 'text-white']"
		>
			{{ isRunning ? '⏸️ Pause' : '▶️ Run' }}
		</button>

		<!-- Separator -->
		<div class="w-[1px] bg-gray-600 my-1"></div>

		<!-- Step Controls -->
		<!-- Step Into (_alias for_Step_Instructionon) -->
		<button
			@click="handleStepInstruction"
			:disabled="isRunning"
			:class="['text-sm px-3 py-1.5 rounded-lg font-semibold transition duration-200 shadow-md whitespace-nowrap bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50']"
			title="Execute the current instruction, stepping into subroutines (JSR)"
		>
			Step Into
		</button>
		
		<!-- _Step_Overr -->
		<button
			@click="handleStepOver"
			:disabled="isRunning"
			:class="['text-sm px-3 py-1.5 rounded-lg font-semibold transition duration-200 shadow-md whitespace-nowrap bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50']"
			title="Execute the current instruction. If JSR, run until return address."
		>
			Step Over
		</button>
		
		<!-- _Step_Outt_Exit_SubSub) -->
		<button
			@click="handleStepOut"
			:disabled="isRunning"
			:class="['text-sm px-3 py-1.5 rounded-lg font-semibold transition duration-200 shadow-md whitespace-nowrap bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50']"
			title="Run program until the next RTS or RTI (Return from Subroutine/Interrupt)"
		>
			Step Out
		</button>
		
		<!-- _Separator -->
		<div class="w-[1px] bg-gray-600 my-1"></div>

		<!-- _Reset -->
		<button
			@click="handleReset"
			:class="['text-sm px-3 py-1.5 rounded-lg font-semibold transition duration-200 shadow-md whitespace-nowrap bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50']"
			title="Reset the CPU and memory"
		>
			Reset
		</button>
	</div>	
</template>

<script lang="ts" setup>
/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

	interface Props {
		isRunning: boolean;
		handleReset: () => void;
		handleRunPause: () => void;
		handleStepInstruction: () => void;
		handleStepOver: () => void;
		handleStepOut: () => void;
	}

	const props = withDefaults(defineProps<Props>(), {
		isRunning: false,
		count: 0,
	})

</script>