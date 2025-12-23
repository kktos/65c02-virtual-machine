import { ref } from "vue";

// Shared state
const jumpEvent = ref<{ address: number } | null>(null);

export function useDisassembly() {
	const requestJump = (address: number) => {
		jumpEvent.value = { address };
	};

	return {
		jumpEvent,
		requestJump,
	};
}
