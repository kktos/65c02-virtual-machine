import { nextTick, ref } from "vue";

const BUFFER_SIZE = 500;
const logs = ref<string[]>([]);
const logEndRef = ref<HTMLDivElement | null>(null);

const print = (text: string) => {
	logs.value.push(text);
	if (logs.value.length > BUFFER_SIZE) logs.value.shift();
	nextTick(() => {
		if (logEndRef.value) logEndRef.value.scrollIntoView({ behavior: "smooth" });
	});
};

const printError = (text: string) => {
	// should be able to print in color; here red
	print(text);
};

export function useCmdConsole() {
	return {
		logs,
		print,
		printError,
		logEndRef,
	};
}
