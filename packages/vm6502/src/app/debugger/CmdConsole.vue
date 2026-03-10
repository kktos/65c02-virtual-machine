<template>
	<div
		v-if="isConsoleVisible"
		:style="{ height: height + 'px' }"
		class="absolute bottom-0 left-5 right-5 min-h-[100px] bg-gray-800/70 flex flex-col border-t border-gray-700 backdrop-blur-sm z-10"
	>
		<!-- Resize Handle -->
		<div
			class="absolute -top-1 left-0 right-0 h-2 cursor-row-resize hover:bg-cyan-500/50 transition-colors z-20"
			@mousedown.prevent="startResizeLogs"
		></div>

		<div
			class="flex justify-between items-center px-2 py-1 bg-gray-800/50 border-b border-gray-700 shrink-0 font-mono text-xs"
		>
			<span class="font-bold text-gray-300 uppercase tracking-wider text-[10px]">Console</span>
			<div class="flex items-center gap-1">
				<button
					@click="openRoutineEditor"
					title="Open Routine Editor"
					class="p-1 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500"
				>
					<FileCode2 class="w-4 h-4" />
				</button>
				<button
					@click="decreaseFontSize"
					title="Decrease font size"
					class="p-1 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500"
				>
					<ZoomOut class="w-4 h-4" />
				</button>
				<button
					@click="increaseFontSize"
					title="Increase font size"
					class="p-1 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500"
				>
					<ZoomIn class="w-4 h-4" />
				</button>
				<button
					@click="clearConsole"
					title="Clear console"
					class="p-1 rounded-md text-gray-400 hover:bg-gray-700 hover:text-red-400 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500"
				>
					<Trash2 class="w-4 h-4" />
				</button>
			</div>
		</div>
		<ScrollbackView
			class="flex-1 overflow-x-hidden"
			:logs="logs"
			@click="focusInput"
			:style="{ fontSize: fontSize + 'px', fontFamily: fontFamily, color: fontColor }"
		/>
		<div class="p-1 border-t border-gray-900/50">
			<div class="flex items-center gap-1">
				<Loader2 v-if="isLoading" class="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
				<span v-else class="text-gray-500 font-bold select-none">{{ prompt }}</span>
				<input
					ref="inputRef"
					v-model="inputText"
					:disabled="isLoading"
					@keydown.enter="handleEnter"
					@keydown.up.prevent="handleHistoryUp"
					@keydown.down.prevent="handleHistoryDown"
					@keydown.escape="handleEscape"
					class="flex-1 bg-transparent border-none outline-none placeholder-gray-700 font-mono text-xs disabled:text-gray-500"
					:style="{ color: fontColor }"
					spellcheck="false"
					autocomplete="off"
				/>
			</div>
			<div v-if="isLoading && progress > 0" class="h-0.5 bg-gray-700/50 w-full mt-1 rounded">
				<div
					class="h-0.5 bg-cyan-400 rounded transition-all duration-150 ease-linear"
					:style="{ width: progress + '%' }"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useCmdConsole } from "@/composables/useCmdConsole";
import { useCommands } from "@/composables/useCommands";
import { useScrollback } from "@/composables/useScrollback";
import ScrollbackView from "@/components/ScrollbackView.vue";
import { useMachine } from "@/composables/useMachine";
import { useConsoleSettings } from "@/composables/useConsoleSettings";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoutineEditor } from "@/composables/useRoutineEditor";
import { FileCode2, ZoomOut, ZoomIn, Trash2, Loader2 } from "lucide-vue-next";
import { useEventBus } from "@vueuse/core";

const { height, fontSize, fontFamily, fontColor, loadSettings, increaseFontSize, decreaseFontSize } =
	useConsoleSettings();

const inputText = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
let tempInput = "";
const historyIndex = ref(-1);

const { logs, print, printError, clear } = useScrollback();
const { isConsoleVisible, hideConsole, BUS_KEY } = useCmdConsole();
const {
	isLoading,
	progress,
	executeCommand,
	success,
	error,
	commandHistory,
	shouldClose,
	isMultiLine,
	multiLinePrompt,
} = useCommands();
const { vm } = useMachine();

const { open } = useRoutineEditor();
const openRoutineEditor = (event: MouseEvent) => open(event);
onMounted(() => loadSettings());
const clearConsole = () => clear();

useEventBus<void>(BUS_KEY).on(clearConsole);

watch(
	() => isConsoleVisible.value,
	(visible) => {
		if (visible) nextTick(() => inputRef.value?.focus());
	},
);

const prompt = computed(() => (isMultiLine.value ? multiLinePrompt.value : "> "));

const handleEnter = async () => {
	const currentInput = inputText.value;
	// In multi-line mode, we want to be able to submit empty lines.
	if (!isMultiLine.value && !currentInput) return;

	print(prompt.value + currentInput, "input");

	if (await executeCommand(currentInput, vm.value)) {
		if (success.value) {
			const output = success.value;
			if (typeof output === "string") {
				print(`\n${output}`);
			} else if (typeof output === "object" && output.content) {
				print(`\n${output.content}`, "output", output.format);
			}
		}
	} else {
		printError(error.value);
	}
	if (shouldClose.value) hideConsole();

	// Only reset history tracking if we are NOT in a multi-line session
	if (!isMultiLine.value) {
		historyIndex.value = -1;
		tempInput = "";
	}
	inputText.value = "";
	nextTick(() => inputRef.value?.focus());
};

const focusInput = () => {
	const selection = window.getSelection();
	if (!selection || selection.toString().length === 0) inputRef.value?.focus();
};

const startResizeLogs = (e: MouseEvent) => {
	const startY = e.clientY;
	const startHeight = height.value;

	const onMouseMove = (e: MouseEvent) => {
		const deltaY = startY - e.clientY;
		height.value = Math.max(100, startHeight + deltaY);
	};

	const onMouseUp = () => {
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("mouseup", onMouseUp);
	};

	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);
};

const handleHistoryUp = () => {
	if (commandHistory.value.length === 0) return;
	if (historyIndex.value === -1) {
		tempInput = inputText.value;
	}
	if (historyIndex.value < commandHistory.value.length - 1) {
		historyIndex.value++;
		inputText.value = commandHistory.value[commandHistory.value.length - 1 - historyIndex.value] as string;
	}
};

const handleHistoryDown = () => {
	if (historyIndex.value >= 0) {
		historyIndex.value--;
		inputText.value = (
			historyIndex.value === -1
				? tempInput
				: commandHistory.value[commandHistory.value.length - 1 - historyIndex.value]
		) as string;
	}
};

const handleEscape = () => {
	hideConsole();
};
</script>
