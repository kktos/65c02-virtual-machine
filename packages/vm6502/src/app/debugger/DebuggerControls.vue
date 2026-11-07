<template>
	<!-- Same frame as the machine toolbar (App.vue) so both bars line up edge to edge -->
	<!-- @container: the BRK / Trace text labels are dropped (icons + tooltips remain) when the toolbar is narrow -->
	<div
		ref="toolbarRoot"
		class="@container flex flex-wrap items-center gap-1 p-1 bg-gray-800 border-b border-gray-700"
	>
		<!-- Execution -->
		<button
			@click="toggle"
			class="toolbar-btn text-white"
			:class="isRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'"
			:title="isRunning ? 'Pause' : 'Run'"
		>
			<Pause v-if="isRunning" class="h-4 w-4" />
			<Play v-else class="h-4 w-4" />
		</button>
		<button @click="vm?.stepOver" :disabled="isRunning" class="toolbar-btn" title="Step Over (F10)">
			<RedoDot class="h-4 w-4" />
		</button>
		<button @click="vm?.step" :disabled="isRunning" class="toolbar-btn" title="Step Into (F11)">
			<ArrowDownToDot class="h-4 w-4" />
		</button>
		<button @click="vm?.stepOut" :disabled="isRunning" class="toolbar-btn" title="Step Out (Shift+F11)">
			<ArrowUpFromDot class="h-4 w-4" />
		</button>
		<button @click="vm?.reset" class="toolbar-btn group hover:bg-red-900/30" title="Reset the CPU and memory">
			<RotateCcw class="h-4 w-4 text-red-400 group-hover:text-red-300" />
		</button>

		<div class="toolbar-sep"></div>

		<!-- Toggles -->
		<button
			@click="toggleBreakOnBrk"
			class="toolbar-btn px-2"
			:class="{ 'bg-yellow-600 hover:bg-yellow-500 text-white': breakOnBrk }"
			:aria-pressed="breakOnBrk"
			title="Pause on BRK instruction"
		>
			<Octagon class="h-4 w-4" />
			<span class="hidden @[35rem]:inline">BRK</span>
		</button>
		<button
			@click="toggleTrace"
			class="toolbar-btn px-2"
			:class="{ 'bg-purple-600 hover:bg-purple-500 text-white': traceEnabled }"
			:aria-pressed="traceEnabled"
			:title="vm?.traceOverflow?.value ? 'Execution tracing (JSR/JMP) — buffer overflow' : 'Enable execution tracing (JSR/JMP)'"
		>
			<span
				v-if="vm?.traceOverflow?.value"
				class="absolute top-1 right-1 w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse shadow-[0_0_4px_rgba(251,146,60,0.6)]"
			></span>
			<ScrollText class="h-4 w-4" />
			<span class="hidden @[35rem]:inline">Trace</span>
		</button>

		<div class="toolbar-sep"></div>

		<!-- Tools -->
		<BreakpointsDrawer :top="toolbarBottom" />
		<MemoryMap />
		<MachineState />
		<button
			@click="vm?.refreshVideo"
			:disabled="isRunning"
			class="toolbar-btn group"
			title="Force a video refresh (useful when paused)"
		>
			<Monitor class="h-4 w-4 text-gray-400 group-hover:text-cyan-300" />
			<RefreshCw class="absolute h-2 w-2 -mt-1 text-cyan-400 group-hover:text-cyan-300" />
		</button>
		<button @click="pasteFromClipboard" class="toolbar-btn" title="Paste from Clipboard">
			<ClipboardPaste class="h-4 w-4" />
		</button>
		<button
			@click="toggleCommandInterface"
			class="toolbar-btn"
			:class="{ 'bg-gray-700 text-cyan-300': isConsoleVisible }"
			title="Open Command Interface (Ctrl+Shift+D)"
		>
			<Terminal class="h-4 w-4" />
		</button>
	</div>
</template>
<script lang="ts" setup>
import {
	ArrowDownToDot,
	ArrowUpFromDot,
	ClipboardPaste,
	Monitor,
	Octagon,
	Pause,
	Play,
	RedoDot,
	RefreshCw,
	RotateCcw,
	ScrollText,
	Terminal,
} from "lucide-vue-next";
import { inject, type Ref, ref } from "vue";
import { useElementBounding } from "@vueuse/core";
import BreakpointsDrawer from "@/app/debugger/BreakpointsDrawer.vue";
import MemoryMap from "@/app/debugger/memorymap/MemoryMap.vue";
import MachineState from "@/app/debugger/MachineState.vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useCmdConsole } from "@/composables/useCmdConsole";

const vm = inject<Ref<VirtualMachine>>("vm");

interface Props {
	isRunning: boolean;
}
const { isRunning } = defineProps<Props>();

// The breakpoints drawer opens right below this toolbar (its height varies when it wraps)
const toolbarRoot = ref<HTMLElement | null>(null);
const { bottom: toolbarBottom } = useElementBounding(toolbarRoot);

const toggle = () => {
	if (isRunning) vm?.value.pause();
	else vm?.value.play();
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
		// Send to VM to simulate keystrokes
		if (text) await vm.value.typeText(text);
	} catch (err) {
		console.error("Failed to read clipboard:", err);
		// Fallback or alert if permission denied
		alert("Could not paste: Clipboard access denied or empty.");
	}
};

const { isConsoleVisible } = useCmdConsole();
const toggleCommandInterface = () => {
	isConsoleVisible.value = !isConsoleVisible.value;
};
</script>
