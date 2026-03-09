import { ref, readonly, type Ref } from "vue";

export interface LogLine {
	text: string;
	color?: string;
}

// Singleton state
const logs: Ref<LogLine[]> = ref([]);

export function useScrollback() {
	const print = (text: string, color = "text-gray-300") => {
		const lines = text.split("\n");
		for (const line of lines) {
			logs.value.push({ text: line, color });
		}
	};

	const clear = () => {
		logs.value = [];
	};

	return {
		logs: readonly(logs),
		print,
		clear,
	};
}
