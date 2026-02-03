import { type ComputedRef, computed, ref } from "vue";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

// Global state to be shared across components
export type BreakpointState = Breakpoint & { enabled: boolean };

const getBreakpointKey = (bp: Breakpoint) => {
	return `${bp.type}|${bp.address}|${bp.endAddress ?? "null"}`;
};

const breakpoints = ref<Map<string, BreakpointState>>(new Map());
const STORAGE_KEY = "vm6502-breakpoints";

type UseBreakpointsResult = {
	breakpoints: ComputedRef<BreakpointState[]>;
	loadBreakpoints: (vm?: VirtualMachine) => Promise<void>;
	addBreakpoint: (bp: Breakpoint, vm?: VirtualMachine) => void;
	removeBreakpoint: (bp: Breakpoint, vm?: VirtualMachine) => void;
	toggleBreakpoint: (bp: Breakpoint, vm?: VirtualMachine) => void;
	toggleBreakpointEnable: (bp: Breakpoint, vm?: VirtualMachine) => void;
	pcBreakpoints: ComputedRef<Map<number, boolean>>;
};

export function useBreakpoints(): UseBreakpointsResult {
	const saveBreakpoints = () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(breakpoints.value.values())));
	};

	const loadBreakpoints = async (vm?: VirtualMachine) => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const loaded: BreakpointState[] = JSON.parse(stored).map((bp: BreakpointState) => ({
					...bp,
					enabled: bp.enabled ?? true,
				}));

				const newMap = new Map<string, BreakpointState>();
				loaded.forEach((bp) => {
					newMap.set(getBreakpointKey(bp), bp);
				});
				breakpoints.value = newMap;

				if (vm) {
					await vm.ready;
					breakpoints.value.forEach((bp) => {
						if (bp.enabled) vm.addBP(bp.type, bp.address, bp.endAddress);
					});
				}
			} catch (e) {
				console.error("Failed to load breakpoints", e);
			}
		}
	};

	const addBreakpoint = (bp: Breakpoint, vm?: VirtualMachine) => {
		const key = getBreakpointKey(bp);
		// Prevent duplicates
		if (breakpoints.value.has(key)) return;

		const newBp: BreakpointState = { ...bp, enabled: true };
		breakpoints.value.set(key, newBp);
		saveBreakpoints();
		vm?.addBP(bp.type, bp.address, bp.endAddress);
	};

	const removeBreakpoint = (bp: Breakpoint, vm?: VirtualMachine) => {
		const key = getBreakpointKey(bp);
		if (breakpoints.value.has(key)) {
			// Always remove from VM to ensure sync, regardless of enabled state
			vm?.removeBP(bp.type, bp.address, bp.endAddress);

			breakpoints.value.delete(key);
			saveBreakpoints();
		}
	};

	const toggleBreakpoint = (bp: Breakpoint, vm?: VirtualMachine) => {
		const key = getBreakpointKey(bp);
		if (breakpoints.value.has(key)) {
			removeBreakpoint(bp, vm);
		} else {
			addBreakpoint(bp, vm);
		}
	};

	const toggleBreakpointEnable = (bp: Breakpoint, vm?: VirtualMachine) => {
		const key = getBreakpointKey(bp);
		const item = breakpoints.value.get(key);
		if (item) {
			const updatedItem = { ...item, enabled: !item.enabled };
			breakpoints.value.set(key, updatedItem);
			saveBreakpoints();
			if (updatedItem.enabled) {
				vm?.addBP(item.type, item.address, item.endAddress);
			} else {
				vm?.removeBP(item.type, item.address, item.endAddress);
			}
		}
	};

	// Computed map for efficient lookup of PC breakpoints (used in DisassemblyView)
	const pcBreakpoints = computed(() => {
		const map = new Map<number, boolean>();
		breakpoints.value.forEach((bp) => {
			if (bp.type === "pc") map.set(bp.address, bp.enabled);
		});
		return map;
	});

	const result: UseBreakpointsResult = {
		breakpoints: computed(() => Array.from(breakpoints.value.values()).sort((a, b) => a.address - b.address)),
		loadBreakpoints,
		addBreakpoint,
		removeBreakpoint,
		toggleBreakpoint,
		toggleBreakpointEnable,
		pcBreakpoints,
	};

	return result;
}
