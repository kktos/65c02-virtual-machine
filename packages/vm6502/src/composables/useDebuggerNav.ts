import { ref } from "vue";

const memoryViewAddress = ref<number | null>(null);
const activeTab = ref<"disassembly" | "memory">("disassembly");
const jumpHistory = ref<number[]>([]);
const historyIndex = ref(-1);
const historyNavigationEvent = ref<{ address: number; timestamp: number } | null>(null);

export function useDebuggerNav() {
	const setMemoryViewAddress = (address: number) => {
		memoryViewAddress.value = address;
	};

	const setActiveTab = (tab: "disassembly" | "memory") => {
		activeTab.value = tab;
	};

	const addJumpHistory = (address: number) => {
		// If we are not at the end of history, truncate it
		if (historyIndex.value < jumpHistory.value.length - 1) jumpHistory.value.splice(historyIndex.value + 1);
		if (jumpHistory.value[jumpHistory.value.length - 1] === address) return;

		jumpHistory.value.push(address);
		historyIndex.value++;
	};

	const navigateHistory = (direction: "back" | "forward") => {
		let newAddress: number | undefined;
		if (direction === "back" && historyIndex.value > 0) {
			historyIndex.value--;
			newAddress = jumpHistory.value[historyIndex.value];
		}
		if (direction === "forward" && historyIndex.value < jumpHistory.value.length - 1) {
			historyIndex.value++;
			newAddress = jumpHistory.value[historyIndex.value];
		}
		if (newAddress !== undefined) {
			historyNavigationEvent.value = { address: newAddress, timestamp: Date.now() };
		}
	};

	const jumpToAddress = (address: number) => {
		addJumpHistory(address);
		historyNavigationEvent.value = { address, timestamp: Date.now() };
	};

	const clearHistory = () => {
		jumpHistory.value.length = 0;
		historyIndex.value = -1;
	};

	const jumpToHistoryIndex = (index: number) => {
		if (index >= 0 && index < jumpHistory.value.length) {
			historyIndex.value = index;
			const address = jumpHistory.value[index];
			historyNavigationEvent.value = { address, timestamp: Date.now() };
		}
	};

	return {
		memoryViewAddress,
		setMemoryViewAddress,
		activeTab,
		setActiveTab,
		jumpHistory,
		historyIndex,
		addJumpHistory,
		navigateHistory,
		historyNavigationEvent,
		jumpToAddress,
		jumpToHistoryIndex,
		clearHistory,
	};
}
