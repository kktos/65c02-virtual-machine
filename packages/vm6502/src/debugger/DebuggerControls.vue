<template>
	<div class="flex justify-start items-center space-x-4 mb-6 p-3 bg-gray-800 rounded-xl shadow-inner border border-gray-700 shrink-0">

		<ButtonGroup>
			<Button	@click="controls.handleRunPause"
				size="sm"
				:class="[ isRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500']"
			>
				{{ isRunning ? '⏸️ Pause' : '▶️ Run' }}
			</Button>
		</ButtonGroup>

		<ButtonGroup>
			<Button @click="controls.handleStepInstruction"
				size="sm"
				:disabled="isRunning"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Execute the current instruction, stepping into subroutines (JSR)"
			>
				Step Into
			</Button>

			<!-- _Step_Overr -->
			<Button @click="controls.handleStepOver"
				size="sm"
				:disabled="isRunning"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Execute the current instruction. If JSR, run until return address."
			>
				Step Over
			</Button>

			<Button @click="controls.handleStepOut"
				:disabled="isRunning"
				size="sm"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Run program until the next RTS or RTI (Return from Subroutine/Interrupt)"
			>Step Out</Button>
		</ButtonGroup>

		<ButtonGroup>
			<Button @click="controls.handleReset"
				size="sm"
				class="hover:bg-gray-600"
				title="Reset the CPU and memory"
			>Reset</Button>
		</ButtonGroup>
	</div>
</template>

<script lang="ts" setup>
	import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

	interface DebuggerControls {
		handleRunPause: () => void;
		handleStepInstruction: () => void;
		handleStepOver: () => void;
		handleStepOut: () => void;
		handleReset: () => void;
	}

	interface Props {
		isRunning: boolean;
		controls: DebuggerControls;
	}

	const { isRunning=false, controls } = defineProps<Props>();
</script>
