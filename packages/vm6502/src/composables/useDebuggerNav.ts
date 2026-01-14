import { ref } from "vue";

const memoryViewAddress = ref<number | null>(null);
const activeTab = ref<"disassembly" | "memory">("disassembly");

export function useDebuggerNav() {
	const setMemoryViewAddress = (address: number) => {
		memoryViewAddress.value = address;
	};

	const setActiveTab = (tab: "disassembly" | "memory") => {
		activeTab.value = tab;
	};

	return {
		memoryViewAddress,
		setMemoryViewAddress,
		activeTab,
		setActiveTab,
	};
}
