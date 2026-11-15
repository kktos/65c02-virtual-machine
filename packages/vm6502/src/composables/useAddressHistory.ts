import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from "vue";

type AddressHistory = {
	jumpHistory: Ref<number[]>;
	/** index of the current location in jumpHistory, -1 while it is empty */
	historyIndex: Ref<number>;
	historyNavigationEvent: Ref<{ address: number; timestamp: number } | null>;
	/** the address the view currently shows, registered by the view with trackLocation */
	getLocation: () => number | undefined;
};
const addressHistoryMap = new Map<string, AddressHistory>();

export function useAddressHistory(name: string) {
	if (!addressHistoryMap.has(name)) {
		addressHistoryMap.set(name, {
			jumpHistory: ref([]),
			historyIndex: ref(-1),
			historyNavigationEvent: ref(null),
			getLocation: () => undefined,
		});
	}
	const history = addressHistoryMap.get(name)!;
	const { jumpHistory, historyIndex, historyNavigationEvent } = history;

	/** records a visit to address: drops the forward entries, unless address already is the current location */
	const addJumpHistory = (address: number) => {
		if (jumpHistory.value[historyIndex.value] === address) return;
		jumpHistory.value.splice(historyIndex.value + 1);
		jumpHistory.value.push(address);
		historyIndex.value = jumpHistory.value.length - 1;
	};

	/**
		The view showing this history registers where it currently is, so a jump records its origin and Back returns there.
		Once the view unmounts, the last address it showed remains the origin of the next jump.
	*/
	const trackLocation = (getLocation: () => number) => {
		history.getLocation = getLocation;
		if (!getCurrentInstance()) return;
		onBeforeUnmount(() => {
			if (history.getLocation !== getLocation) return;
			const lastLocation = getLocation();
			history.getLocation = () => lastLocation;
		});
	};

	/** records a jump: where the view was (if tracked), then where it goes */
	const recordJump = (address: number) => {
		const origin = history.getLocation();
		if (origin !== undefined) addJumpHistory(origin);
		addJumpHistory(address);
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
		recordJump(address);
		historyNavigationEvent.value = { address, timestamp: Date.now() };
	};

	const clearHistory = () => {
		jumpHistory.value.length = 0;
		historyIndex.value = -1;
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
		recordJump,
		trackLocation,
		navigateHistory,
		historyNavigationEvent,
		jumpToAddress,
		jumpToHistoryIndex,
		clearHistory,
	};
}
