import { ref } from "vue";
import { useEventBus } from "@vueuse/core";

export type LogEntry = {
	text: string;
	color?: string;
};

const EVENTBUS_KEY = "cmd-console-clear";
const isConsoleVisible = ref(false);
const consoleBus = useEventBus<string>(EVENTBUS_KEY);

const showConsole = () => {
	isConsoleVisible.value = true;
};

const hideConsole = () => {
	isConsoleVisible.value = false;
};

const clearConsole = () => {
	consoleBus.emit("cls");
};

const print = (type: string, text: string) => {
	consoleBus.emit("print", [type, text]);
};

export function useCmdConsole() {
	return {
		BUS_KEY: EVENTBUS_KEY,
		showConsole,
		hideConsole,
		clearConsole,
		isConsoleVisible,
		print,
	};
}
