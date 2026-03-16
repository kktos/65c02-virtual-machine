import { ref, type Ref } from "vue";

type AddressHistory = {
	jumpHistory: Ref<number[]>;
	historyIndex: Ref<number>;
	historyNavigationEvent: Ref<{ address: number; timestamp: number } | null>;
};
const addressHistoryMap = new Map<string, AddressHistory>();

export function useAddressHistory(name: string) {
	if (!addressHistoryMap.has(name)) {
		addressHistoryMap.set(name, {
			jumpHistory: ref([]),
			historyIndex: ref(0),
			historyNavigationEvent: ref(null),
		});
	}
	const { jumpHistory, historyIndex, historyNavigationEvent } = addressHistoryMap.get(name)!;

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
		historyIndex.value = 0;
	};

	const jumpToHistoryIndex = (index: number) => {
		if (index >= 0 && index < jumpHistory.value.length) {
			historyIndex.value = index;
			const address = jumpHistory.value[index] as number;
			historyNavigationEvent.value = { address, timestamp: Date.now() };
		}
	};

	return {
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
