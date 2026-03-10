import { ref, readonly, type Ref } from "vue";
import type { LogEntry } from "@/types/scrollback";

const BUFFER_SIZE = 500;
let nextId = 0;

export function useScrollback() {
	const logs: Ref<LogEntry[]> = ref([]);

	const print = (text: string, type: LogEntry["type"] = "output", format: LogEntry["format"] = "text") => {
		const lines = text.split("\n");
		for (const line of lines) {
			logs.value.push({ id: nextId++, text: line, type, format });
		}
		while (logs.value.length > BUFFER_SIZE) {
			logs.value.shift();
		}
	};

	const printError = (text: string) => {
		// The class 'text-red-400' is now applied based on the 'error' type
		// in the ScrollbackView.vue component.
		if (!text) return;
		print(text, "error");
	};

	const clear = () => {
		logs.value = [];
	};

	return {
		logs: readonly(logs),
		print,
		printError,
		clear,
	};
}
