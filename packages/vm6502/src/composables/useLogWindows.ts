import { reactive } from "vue";

export interface LogLine {
	text: string;
}

export interface LogWindow {
	id: string;
	name: string;
	lines: LogLine[];
	isVisible: boolean;
	position: { x: number; y: number };
	size: { width: number; height: number };
	zIndex: number;
}

const logWindows = reactive<Map<string, LogWindow>>(new Map());

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
			lines: [],
			isVisible: true,
			position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
			size: { width: 400, height: 200 },
			zIndex: 0, // will be set by bringToFront
		});
		logWindows.set(name, window);
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
	const window = logWindows.get(name);
	if (window) {
		window.lines.length = 0;
	}
};

const trace = (name: string, text: string) => {
	let window = logWindows.get(name);
	if (!window || !window.isVisible) {
		window = open(name);
	}
	window.lines.push({ text });
	if (window.lines.length > 500) {
		window.lines.splice(0, window.lines.length - 500);
	}
};

const setActive = (name: string) => {
	const window = logWindows.get(name);
	if (window) {
		bringToFront(window);
	}
};

export function useLogWindows() {
	return {
		logWindows,
		open,
		close,
		clear,
		trace,
		setActive,
	};
}
