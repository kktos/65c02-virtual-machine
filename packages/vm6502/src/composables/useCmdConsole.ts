import { ref } from "vue";
import { useEventBus } from "@vueuse/core";

export type LogEntry = {
	text: string;
	color?: string;
};

const EVENTBUS_KEY = "cmd-console-clear";
const isConsoleVisible = ref(false);
const clearConsoleBus = useEventBus<void>(EVENTBUS_KEY);

const showConsole = () => {
	isConsoleVisible.value = true;
};

const hideConsole = () => {
	isConsoleVisible.value = false;
};

const clearConsole = () => {
	clearConsoleBus.emit();
};

export function useCmdConsole() {
	return {
		BUS_KEY: EVENTBUS_KEY,
		showConsole,
		hideConsole,
		clearConsole,
		isConsoleVisible,
	};
}
