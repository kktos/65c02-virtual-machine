<template>
	<div class="flex justify-start items-center space-x-2 bg-gray-800 p-2 rounded-xl shadow-inner border border-gray-700 shrink-0">

		<ButtonGroup>
			<Button	@click="toggle"
				size="sm"
				:class="[ isRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500']"
			>
				<Pause v-if="isRunning" class="h-4 w-4" />
				<Play v-else class="h-4 w-4" />
			</Button>

			<Button @click="vm?.stepOver"
				size="sm"
				:disabled="isRunning"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Step Over (F10)"
			>
				<RedoDot class="h-4 w-4"/>
			</Button>

			<Button @click="vm?.step"
				size="sm"
				:disabled="isRunning"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Step Into (F11)"
			>
				<ArrowDownToDot class="h-4 w-4" />
			</Button>

			<Button @click="vm?.stepOut"
				:disabled="isRunning"
				size="sm"
				class="hover:bg-gray-600 disabled:opacity-50"
				title="Step Out (shift-F11)"
			>
				<ArrowUpFromDot class="h-4 w-4" />
			</Button>
		</ButtonGroup>

		<ButtonGroup>
			<Button @click="toggleBreakOnBrk"
				size="sm"
				:class="[ breakOnBrk ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'hover:bg-gray-600 text-gray-300']"
				title="Pause on BRK instruction"
			>
				<Octagon class="mr-2 h-4 w-4" />
				BRK
			</Button>
		</ButtonGroup>

		<ButtonGroup>
			<Button @click="toggleTrace" class="relative"
				size="sm"
				:class="[ traceEnabled ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'hover:bg-gray-600 text-gray-300']"
				title="Enable execution tracing (JSR/JMP)"
			>
				<span v-if="vm?.traceOverflow?.value" class="absolute top-1 right-1 w-2 h-2 bg-orange-400 rounded-full animate-pulse shadow-[0_0_4px_rgba(251,146,60,0.6)]" title="Trace buffer overflow"></span>
				<ScrollText class="mr-2 h-4 w-4" />
				Trace
			</Button>
		</ButtonGroup>


		<ButtonGroup>
			<Button @click="vm?.reset"
			size="sm"
			class="hover:bg-gray-600"
			title="Reset the CPU and memory"
			>Reset</Button>
		</ButtonGroup>

		<MemoryMap />

		<button
			@click="vm?.refreshVideo"
			:disabled="isRunning"
			class="group relative flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
			title="Force a video refresh (useful when paused)"
		>
			<RefreshCw class="h-2.5 w-2.5 -mt-1 text-cyan-400 group-hover:text-cyan-300" />
			<Monitor class="absolute h-6 w-6 text-gray-400 group-hover:text-cyan-300" />
		</button>


		<ButtonGroup>
			<Button
				class="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
				title="Load Symbols (*.sym)"
				@click="triggerSymbolLoad"
			>
				<Tag class="h-4 w-4 text-cyan-400 group-hover:text-cyan-300" />
			</Button>
			<input
				type="file"
				ref="symbolFileInput"
				class="hidden"
				accept=".sym,.txt"
				@change="handleSymbolFile"
			/>
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
import { ArrowDownToDot, ArrowUpFromDot, Monitor, Octagon, Pause, Play, RedoDot, RefreshCw, ScrollText, Tag } from "lucide-vue-next";
import { inject, type Ref, ref } from "vue";
import MemoryMap from "@/app/debugger/memorymap/MemoryMap.vue";
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { useSymbols } from "@/composables/useSymbols";
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

	const symbolFileInput = ref<HTMLInputElement | null>(null);
	const { parseSymbolsFromText, addSymbols } = useSymbols();

	const triggerSymbolLoad = () => {
		symbolFileInput.value?.click();
	};

	const handleSymbolFile = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const file = input.files[0] as File;
		const text = await file.text();
		const symbols= parseSymbolsFromText(text);
		addSymbols(symbols);
		input.value = ''; // Reset input
	};

	const pasteFromClipboard = async () => {
		if (!vm?.value) return;

		try {
			// Read text from the system clipboard
			const text = await navigator.clipboard.readText();
			// Send to VM to simulate keystrokes
			if (text) await vm.value.typeText(text);
		} catch (err) {
			console.error("Failed to read clipboard:", err);
			// Fallback or alert if permission denied
			alert("Could not paste: Clipboard access denied or empty.");
		}
	};
</script>
