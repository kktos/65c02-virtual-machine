import { ref, readonly, type Ref } from "vue";

export interface LogLine {
	text: string;
	color?: string;
}

const BUFFER_SIZE = 500;

export function useScrollback() {
	const logs: Ref<LogLine[]> = ref([]);

	const print = (text: string, color = "") => {
		const lines = text.split("\n");
		for (const line of lines) logs.value.push({ text: line, color });
		if (logs.value.length > BUFFER_SIZE) logs.value.shift();
	};

	const printError = (text: string) => {
		print(text, "text-red-400");
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
