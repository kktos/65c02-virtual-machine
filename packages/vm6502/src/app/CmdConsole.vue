<template>
	<div
		v-if="show"
		:style="{ height: height + 'px' }"
		class="absolute bottom-0 left-5 right-5 min-h-[100px] bg-gray-800/70 text-green-400 font-mono text-xs flex flex-col border-t border-gray-700 backdrop-blur-sm z-10"
	>
		<!-- Resize Handle -->
		<div
			class="absolute -top-1 left-0 right-0 h-2 cursor-row-resize hover:bg-cyan-500/50 transition-colors z-20"
			@mousedown.prevent="startResizeLogs"
		></div>

		<div class="flex justify-between items-center px-2 py-1 bg-gray-800/50 border-b border-gray-700 shrink-0">
			<span class="font-bold text-gray-300 uppercase tracking-wider text-[10px]">Console</span>
			<button @click="clearLogs" class="text-[10px] hover:text-red-400 text-gray-400 transition-colors">
				Clear
			</button>
		</div>
		<div class="flex-1 overflow-y-auto p-2 flex flex-col" @click="focusInput">
			<div class="mt-auto space-y-0.5">
				<div v-for="(log, i) in logs" :key="i" class="break-all border-b border-gray-800/30 pb-0.5">
					{{ log }}
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
import { ref, nextTick } from "vue";

defineProps<{
	show: boolean;
}>();

const height = ref(200);
const inputText = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

const { logs, print, printError, logEndRef } = useCmdConsole();
const { executeCommand, success, error } = useCommands();
const { vm } = useMachine();

const clearLogs = () => {
	logs.value = [];
};

const handleEnter = async () => {
	if (!inputText.value) return;

	if (await executeCommand(inputText.value, vm?.value)) {
		print(success.value);
	} else printError(error.value);

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
</script>
