import { ref, watch } from "vue";

const STORAGE_KEY = "vm6502_target_speed";
const stored = localStorage.getItem(STORAGE_KEY);
const targetSpeed = ref(stored ? Number(stored) : 1);

export function useEmulatorSpeed() {
	watch(targetSpeed, (val) => {
		localStorage.setItem(STORAGE_KEY, String(val));
	});

	return { targetSpeed };
}
