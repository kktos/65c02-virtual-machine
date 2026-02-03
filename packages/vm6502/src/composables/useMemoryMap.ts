import { reactive, toRefs } from "vue";
import type { MemoryRegion } from "@/types/machine.interface";

export type { MemoryRegion };

const state = reactive<{ regions: MemoryRegion[]; currentBank: number }>({
	regions: [],
	currentBank: 0,
});

const getRandomColor = () => {
	const hue = Math.floor(Math.random() * 360);
	// Using HSL for vibrant and distinct colors.
	return `hsl(${hue}, 70%, 50%)`;
};

export function useMemoryMap() {
	const addRegion = (region: MemoryRegion) => {
		const exists = state.regions.some((r) => r.name === region.name);
		if (exists) {
			console.warn(`Region with name ${region.name} already exists.`);
			return;
		}
		state.regions.push({ ...region, removable: region.removable ?? true, color: region.color ?? getRandomColor() });
		state.regions.sort((a, b) => a.start - b.start);
	};

	const removeRegion = (name: string) => {
		const index = state.regions.findIndex((r) => r.name === name);
		if (state.regions[index]) {
			if (state.regions[index].removable === false) return;
			state.regions.splice(index, 1);
		}
	};

	return { ...toRefs(state), addRegion, removeRegion };
}
