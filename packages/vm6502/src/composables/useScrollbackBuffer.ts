import { ref, readonly, type Ref } from "vue";
import type { LogEntry } from "@/types/scrollback";

const BUFFER_SIZE = 500;

export interface ScrollbackBuffer {
	logs: Readonly<Ref<readonly LogEntry[]>>;
	print: (text: string, type?: LogEntry["type"], format?: LogEntry["format"], color?: string) => void;
	printError: (text: string) => void;
	clear: () => void;
}

/**
 * Creates a scrollback buffer with automatic ID generation and size limiting.
 * @param initialId - Starting ID for log entries (default: 0)
 * @param bufferSize - Maximum number of entries to keep (default: 500)
 */
export function createScrollbackBuffer(initialId: number = 0, bufferSize: number = BUFFER_SIZE): ScrollbackBuffer {
	let nextId = initialId;
	const logs: Ref<LogEntry[]> = ref([]);

	const print = (
		text: string,
		type: LogEntry["type"] = "output",
		format: LogEntry["format"] = "text",
		color?: string,
	) => {
		if (format === "text") {
			const lines = text.split("\n");
			for (const line of lines) {
				logs.value.push({ id: nextId++, text: line, type, format, color });
			}
		} else {
			logs.value.push({ id: nextId++, text, type, format, color });
		}
		while (logs.value.length > bufferSize) {
			logs.value.shift();
		}
	};

	const printError = (text: string) => {
		if (!text) return;
		print(text, "error", "text");
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

/**
 * Default scrollback buffer instance for global use.
 * Use this when you need a single, shared scrollback buffer.
 */
const defaultBuffer = createScrollbackBuffer();

export function useScrollbackBuffer(): ScrollbackBuffer {
	return defaultBuffer;
}
