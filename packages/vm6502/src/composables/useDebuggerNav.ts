import { ref } from "vue";
import { useAppLayout } from "./useAppLayout";

const memoryViewAddress = ref<number | null>(null);
const activeTab = ref<"disassembly" | "memory">("disassembly");

export function useDebuggerNav() {
	const setMemoryViewAddress = (address: number) => {
		memoryViewAddress.value = address;
	};

	const { revealPanel } = useAppLayout();

	/** Show a view: its tab when docked, its panel (to the front, expanded) when floating */
	const setActiveTab = (tab: "disassembly" | "memory") => {
		activeTab.value = tab;
		revealPanel(tab === "memory" ? "memory" : "code");
	};

	return {
		memoryViewAddress,
		setMemoryViewAddress,
		activeTab,
		setActiveTab,
	};
}
