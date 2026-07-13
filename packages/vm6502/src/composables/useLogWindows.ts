import { reactive } from "vue";
import type { LogEntry } from "@/types/scrollback";
import { createScrollbackBuffer, type ScrollbackBuffer } from "./useScrollbackBuffer";

export interface LogWindow {
	id: string;
	name: string;
	isVisible: boolean;
	position: { x: number; y: number };
	size: { width: number; height: number };
	zIndex: number;
}

const logWindows = reactive<Map<string, LogWindow>>(new Map());
const buffers = new Map<string, ScrollbackBuffer>();

function bringToFront(window: LogWindow) {
	const maxZ = Array.from(logWindows.values()).reduce((max, w) => Math.max(max, w.zIndex), 99);
	window.zIndex = maxZ + 1;
}

const open = (name: string): LogWindow => {
	let window = logWindows.get(name);
	if (window) {
		window.isVisible = true;
	} else {
		window = reactive({
			id: name,
			name,
			isVisible: true,
			position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
			size: { width: 400, height: 200 },
			zIndex: 0, // will be set by bringToFront
		});
		logWindows.set(name, window);
		buffers.set(name, createScrollbackBuffer());
	}
	bringToFront(window);
	return window;
};

const close = (name: string) => {
	const window = logWindows.get(name);
	if (window) {
		window.isVisible = false;
	}
};

const clear = (name: string) => {
	const buffer = buffers.get(name);
	if (buffer) {
		buffer.clear();
	}
};

const trace = (name: string, text: string, color?: string) => {
	let window = logWindows.get(name);
	if (!window || !window.isVisible) {
		window = open(name);
	}
	const buffer = buffers.get(name);
	if (buffer) {
		buffer.print(text, "output", "text", color);
	}
};

const setActive = (name: string) => {
	const window = logWindows.get(name);
	if (window) {
		bringToFront(window);
	}
};

/**
 * Get the log entries for a window (for use with ScrollbackView)
 */
const getLines = (name: string): readonly LogEntry[] => {
	const buffer = buffers.get(name);
	return buffer?.logs.value ?? [];
};

export function useLogWindows() {
	return {
		logWindows,
		open,
		close,
		clear,
		trace,
		setActive,
		getLines,
	};
}
