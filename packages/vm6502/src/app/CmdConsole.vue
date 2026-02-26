<template>
	<div
		v-if="isConsoleVisible"
		:style="{ height: height + 'px' }"
		class="absolute bottom-0 left-5 right-5 min-h-[100px] bg-gray-800/70 text-green-400 flex flex-col border-t border-gray-700 backdrop-blur-sm z-10"
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
			<div class="flex items-center gap-3">
				<button
					@click="decreaseFontSize"
					class="text-[10px] hover:text-cyan-400 text-gray-400 transition-colors"
				>
					A-
				</button>
				<button
					@click="increaseFontSize"
					class="text-[10px] hover:text-cyan-400 text-gray-400 transition-colors"
				>
					A+
				</button>
				<button @click="clearConsole" class="text-[10px] hover:text-red-400 text-gray-400 transition-colors">
					Clear
				</button>
			</div>
		</div>
		<div
			class="flex-1 overflow-y-auto p-2 flex flex-col"
			@click="focusInput"
			:style="{ fontSize: fontSize + 'px', fontFamily: fontFamily }"
		>
			<div class="mt-auto space-y-0.5">
				<div v-for="(log, i) in logs" :key="i" :class="log.color" class="whitespace-pre">
					{{ log.text }}
				</div>
				<div ref="logEndRef"></div>
			</div>
		</div>
		<div class="flex items-center gap-1 p-1">
			<span class="text-gray-500 font-bold select-none">&gt;</span>
			<input
				ref="inputRef"
				v-model="inputText"
				@keydown.enter="handleEnter"
				@keydown.up.prevent="handleHistoryUp"
				@keydown.down.prevent="handleHistoryDown"
				@keydown.escape="handleEscape"
				class="flex-1 bg-transparent border-none outline-none text-green-400 placeholder-gray-700"
				spellcheck="false"
				autocomplete="off"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useCmdConsole } from "@/composables/useCmdConsole";
import { useCommands } from "@/composables/useCommands";
import { useMachine } from "@/composables/useMachine";
import { useConsoleSettings } from "@/composables/useConsoleSettings";
import { ref, nextTick, watch, onMounted } from "vue";

const { height, fontSize, fontFamily, loadSettings, increaseFontSize, decreaseFontSize } = useConsoleSettings();

const inputText = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
let tempInput = "";
const historyIndex = ref(-1);

const { logs, print, printError, logEndRef, isConsoleVisible, clearConsole, hideConsole } = useCmdConsole();
const { executeCommand, success, error, commandHistory, shouldClose } = useCommands();
const { vm } = useMachine();

onMounted(() => {
	loadSettings();
});

// oxlint-disable-next-line no-unused-expressions ** VSCode doesn't see the use in the template ref
logEndRef;

watch(
	() => isConsoleVisible.value,
	(visible) => {
		if (visible) nextTick(() => inputRef.value?.focus());
	},
);

const handleEnter = async () => {
	if (!inputText.value) return;

	print("> " + inputText.value);
	if (await executeCommand(inputText.value, vm.value)) {
		print("\n" + success.value);
	} else printError(error.value);
	if (shouldClose.value) hideConsole();

	historyIndex.value = -1;
	tempInput = "";
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
