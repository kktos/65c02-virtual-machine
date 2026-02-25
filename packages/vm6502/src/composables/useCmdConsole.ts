import { nextTick, ref } from "vue";

export type LogEntry = {
	text: string;
	color?: string;
};

const BUFFER_SIZE = 500;
const logs = ref<LogEntry[]>([]);
const logEndRef = ref<HTMLDivElement | null>(null);
const isConsoleVisible = ref(false);

const print = (text: string, color?: string) => {
	const lines = text.split("\n");
	for (const line of lines) logs.value.push({ text: line, color });
	if (logs.value.length > BUFFER_SIZE) logs.value.shift();
	nextTick(() => {
		if (logEndRef.value) logEndRef.value.scrollIntoView({ behavior: "smooth" });
	});
};

const printError = (text: string) => {
	// should be able to print in color; here red
	print(text, "text-red-400");
};

const showConsole = () => {
	isConsoleVisible.value = true;
};

const hideConsole = () => {
	isConsoleVisible.value = false;
};

export function useCmdConsole() {
	return {
		logs,
		print,
		printError,
		showConsole,
		hideConsole,
		isConsoleVisible,
		logEndRef,
	};
}
