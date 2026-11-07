import { ref, watch } from "vue";

const STORAGE_KEY = "vm6502_target_speed";
const stored = Number(localStorage.getItem(STORAGE_KEY));
// Fall back to 1 MHz when nothing valid is stored (missing, garbage, or a 0 saved by an earlier bug).
const targetSpeed = ref(Number.isFinite(stored) && stored > 0 ? stored : 1);

export function useEmulatorSpeed() {
	watch(targetSpeed, (val) => {
		localStorage.setItem(STORAGE_KEY, String(val));
	});

	return { targetSpeed };
}
