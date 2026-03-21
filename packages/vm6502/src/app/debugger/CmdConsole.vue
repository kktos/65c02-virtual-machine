<template>
	<FloatingWindow
		ref="windowRef"
		id="cmd_console"
		title="Console"
		window-class="rounded-none"
		:options="{
			defaultWidth: defaultWidth,
			defaultHeight: 250,
			defaultX: 20,
			defaultY: defaultY,
			resizable: true,
			snappable: true,
			snappableResize: true,
			closable: false,
			contentScrollable: false,
		}"
		@close="onWindowClose"
	>
		<template #icon>
			<Terminal class="w-4 h-4" />
		</template>

		<template #header-buttons>
			<div class="flex items-center gap-1 text-gray-400">
				<TriangleAlert v-if="errorHistory.length > 0" color="#ff9a21" class="w-4 h-4" />
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
		</template>

		<div class="flex flex-col h-full">
			<ScrollbackView
				class="flex-1 overflow-x-hidden"
				:logs="logs"
				@click="focusInput"
				@on-link="handleLinkCommand"
				:style="{ fontSize: fontSize + 'px', fontFamily: fontFamily, color: fontColor }"
			/>
			<div class="p-1">
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
						@keydown.escape.prevent="handleEscape"
						class="flex-1 bg-transparent border-none outline-none placeholder-gray-700 text-xs disabled:text-gray-500"
						:style="{ color: fontColor, fontFamily: fontFamily }"
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
	</FloatingWindow>
</template>

<script setup lang="ts">
import { useCmdConsole } from "@/composables/useCmdConsole";
import { useCommands } from "@/composables/useCommands";
import { useScrollback } from "@/composables/useScrollback";
import ScrollbackView from "@/components/ScrollbackView.vue";
import { useMachine } from "@/composables/useMachine";
import { useConsoleSettings } from "@/composables/useConsoleSettings";
import { computed, nextTick, onBeforeMount, onMounted, ref, watch } from "vue";
import { FileCode2, ZoomOut, ZoomIn, Trash2, Loader2, TriangleAlert, Terminal } from "lucide-vue-next";
import { useEventBus } from "@vueuse/core";
import FloatingWindow from "@/components/FloatingWindow.vue";
import { useFloatingWindows } from "@/composables/useFloatingWindows";

const { fontSize, fontFamily, fontColor, loadSettings, increaseFontSize, decreaseFontSize } = useConsoleSettings();

const inputText = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
let tempInput = "";
const historyIndex = ref(-1);
const defaultWidth = ref(200);
const defaultY = ref(0);

const { logs, print, printError, clear } = useScrollback();
const windowRef = ref<InstanceType<typeof FloatingWindow> | null>(null);
const { isConsoleVisible, hideConsole, BUS_KEY } = useCmdConsole();
const {
	isLoading,
	progress,
	executeCommand,
	success,
	error,
	errorHistory,
	commandHistory,
	shouldClose,
	isMultiLine,
	multiLinePrompt,
} = useCommands();
const { vm } = useMachine();

const { open } = useFloatingWindows();
const openRoutineEditor = () => open("routine_editor");

const clearConsole = () => clear();

useEventBus<string>(BUS_KEY).on((cmd: string, args: unknown[]) => {
	switch (cmd) {
		case "cls":
			clearConsole();
			break;
		case "print":
			if (args[0] === "error") printError(args[1] as string);
			else print(args[1] as string, "output", args[0] as "text" | "markdown");
			break;
	}
});

watch(
	() => isConsoleVisible.value,
	(newVal) => {
		if (newVal) {
			windowRef.value?.open();
			nextTick(() => inputRef.value?.focus());
		} else {
			windowRef.value?.close();
		}
	},
);

watch(
	() => success.value,
	(success) => {
		if (success.length > 0) {
			let isFirstNonEmpty = true;
			for (const output of success) {
				if (output.content) {
					const contentToPrint = isFirstNonEmpty ? `\n${output.content}` : output.content;
					print(contentToPrint, "output", output.format);
					isFirstNonEmpty = false;
				}
			}
		}
	},
	{ deep: true },
);

const prompt = computed(() => (isMultiLine.value ? multiLinePrompt.value : "> "));

const handleEnter = async () => {
	const currentInput = inputText.value;
	// In multi-line mode, we want to be able to submit empty lines.
	if (!isMultiLine.value && !currentInput) return;

	print(prompt.value + currentInput, "input");

	if (!(await executeCommand(currentInput, vm.value))) {
		printError(error.value);
		error.value = "";
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

const handleLinkCommand = async (command: string) => {
	if (!(await executeCommand(command, vm.value))) {
		print(`${prompt.value} ${command}`, "input");
		printError(error.value);
		error.value = "";
	}
	// Don't clear user's current input, just focus for the next command
	nextTick(() => inputRef.value?.focus());
};

const focusInput = () => {
	const selection = window.getSelection();
	if (!selection || selection.toString().length === 0) inputRef.value?.focus();
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

const onWindowClose = () => {
	hideConsole();
};

onBeforeMount(() => {
	defaultWidth.value = window.innerWidth / 2 - 40;
	defaultY.value = window.innerHeight - 250;
});

onMounted(() => {
	loadSettings();
	isConsoleVisible.value = !!windowRef.value?.isOpen;
});
</script>
