import { reactive, toRefs } from "vue";

export interface MemoryRegion {
	name: string;
	start: number;
	size: number;
	color: string;
	removable?: boolean;
}

const state = reactive<{ regions: MemoryRegion[] }>({
	regions: [
		// Some default regions might be useful
		{ name: "Zero Page", start: 0x0000, size: 0x0100, color: "#4ade80", removable: true },

		{ name: "LC Bank1", start: 0xd000, size: 0x1000, color: "#992255", removable: true },
		{ name: "LC Bank2", start: 0xd000, size: 0x1000, color: "#4466AA", removable: true },

		{ name: "Stack", start: 0x0100, size: 0x0100, color: "#690c09", removable: false },
		{ name: "IO & ROM", start: 0xc000, size: 0x1000, color: "#690c09", removable: false },
		{ name: "ROM", start: 0xe000, size: 0x2000, color: "#690c09", removable: false },
	],
});

export function useMemoryMap() {
	const addRegion = (region: MemoryRegion) => {
		const exists = state.regions.some((r) => r.name === region.name);
		if (exists) {
			console.warn(`Region with name ${region.name} already exists.`);
			return;
		}
		state.regions.push({ ...region, removable: region.removable ?? true });
		state.regions.sort((a, b) => a.start - b.start);
	};

	const removeRegion = (name: string) => {
		const index = state.regions.findIndex((r) => r.name === name);
		if (index !== -1) {
			if (state.regions[index]!.removable === false) return;
			state.regions.splice(index, 1);
		}
	};

	return { ...toRefs(state), addRegion, removeRegion };
}
