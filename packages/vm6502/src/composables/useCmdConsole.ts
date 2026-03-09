import { ref } from "vue";
import { useEventBus } from "@vueuse/core";

export type LogEntry = {
	text: string;
	color?: string;
};

const isConsoleVisible = ref(false);
const clearConsoleBus = useEventBus<void>("cmd-console-clear");

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
		showConsole,
		hideConsole,
		clearConsole,
		isConsoleVisible,
		onClearConsole: clearConsoleBus.on,
	};
}
