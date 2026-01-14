<template>
	<div class="flex justify-start items-center space-x-4 bg-gray-800 rounded-xl shadow-inner border border-gray-700 shrink-0">

		<ButtonGroup>
			<Button	@click="toggle"
				size="sm"
				:class="[ isRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500']"
			>
				{{ isRunning ? '⏸️ Pause' : '▶️ Run' }}
			</Button>
		</ButtonGroup>

		<ButtonGroup>
			<Button @click="vm?.step"
				size="sm"
				:disabled="isRunning"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Execute the current instruction, stepping into subroutines (JSR)"
			>
				Step Into
			</Button>

			<!-- _Step_Overr -->
			<Button @click="vm?.stepOver"
				size="sm"
				:disabled="isRunning"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Execute the current instruction. If JSR, run until return address."
			>
				Step Over
			</Button>

			<Button @click="vm?.stepOut"
				:disabled="isRunning"
				size="sm"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Run program until the next RTS or RTI (Return from Subroutine/Interrupt)"
			>Step Out</Button>
		</ButtonGroup>

		<ButtonGroup>
			<Button @click="toggleBreakOnBrk"
				size="sm"
				:class="[ breakOnBrk ? 'bg-yellow-600 hover:bg-yellow-500' : 'hover:bg-gray-600']"
				title="Pause execution when a BRK instruction (opcode $00) is encountered"
			>
				BRK
			</Button>
		</ButtonGroup>

		<ButtonGroup>
			<Button @click="toggleTrace"
				size="sm"
				:class="[ traceEnabled ? 'bg-purple-600 hover:bg-purple-500' : 'hover:bg-gray-600']"
				title="Enable execution tracing (JSR/JMP)"
			>
				Trace
			</Button>
		</ButtonGroup>

		<ButtonGroup>
			<Button @click="vm?.refreshVideo"
				size="sm"
				:disabled="isRunning"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Force a video refresh (useful when paused)"
			>Refresh Video</Button>
		</ButtonGroup>

		<ButtonGroup>
			<Button @click="vm?.reset"
				size="sm"
				class="hover:bg-gray-600"
				title="Reset the CPU and memory"
			>Reset</Button>
		</ButtonGroup>
		<ButtonGroup>
		<Button
			class="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
			title="Paste from Clipboard"
			@click="pasteFromClipboard"
		>
			<!-- Clipboard Icon -->
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
				<rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
			</svg>
		</Button>

		</ButtonGroup>
	</div>
</template>

<script lang="ts" setup>
import { inject, type Ref, ref } from "vue";
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

	const vm= inject<Ref<VirtualMachine>>("vm");

	interface Props {
		isRunning: boolean;
	}
	const { isRunning } = defineProps<Props>();

	const toggle = () => {
		if (isRunning)
			vm?.value.pause();
		 else
		 	vm?.value.play();
	};

	const breakOnBrk = ref(false);
	const toggleBreakOnBrk = () => {
		breakOnBrk.value = !breakOnBrk.value;
		vm?.value?.setBreakOnBrk(breakOnBrk.value);
	};

	const traceEnabled = ref(false);
	const toggleTrace = () => {
		traceEnabled.value = !traceEnabled.value;
		vm?.value?.setTrace(traceEnabled.value);
	};

	const pasteFromClipboard = async () => {
		if (!vm?.value) return;

		try {
			// Read text from the system clipboard
			const text = await navigator.clipboard.readText();
			if (text) {
				// Send to VM to simulate keystrokes
				await vm.value.typeText(text);
			}
		} catch (err) {
			console.error("Failed to read clipboard:", err);
			// Fallback or alert if permission denied
			alert("Could not paste: Clipboard access denied or empty.");
		}
	};
</script>
