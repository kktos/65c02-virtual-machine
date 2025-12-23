import { type ComputedRef, computed, type Ref, ref } from "vue";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { VirtualMachine } from "@/virtualmachine.class";

// Global state to be shared across components
export type BreakpointState = Breakpoint & { enabled: boolean };

const breakpoints = ref<BreakpointState[]>([]);
const STORAGE_KEY = "vm6502-breakpoints";

type UseBreakpointsResult = {
	breakpoints: Ref<BreakpointState[]>;
	loadBreakpoints: (vm?: VirtualMachine) => Promise<void>;
	addBreakpoint: (bp: Breakpoint, vm?: VirtualMachine) => void;
	removeBreakpoint: (bp: Breakpoint, vm?: VirtualMachine) => void;
	toggleBreakpoint: (bp: Breakpoint, vm?: VirtualMachine) => void;
	toggleBreakpointEnable: (bp: Breakpoint, vm?: VirtualMachine) => void;
	pcBreakpoints: ComputedRef<Map<number, boolean>>;
};

export function useBreakpoints(): UseBreakpointsResult {
	const saveBreakpoints = () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(breakpoints.value));
	};

	const loadBreakpoints = async (vm?: VirtualMachine) => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const loaded = JSON.parse(stored).map((bp: BreakpointState) => ({
					...bp,
					enabled: bp.enabled ?? true,
				}));
				breakpoints.value = loaded;

				if (vm) {
					await vm.ready;
					loaded.forEach((bp: BreakpointState) => {
						if (bp.enabled) vm.addBP(bp.type, bp.address, bp.endAddress);
					});
				}
			} catch (e) {
				console.error("Failed to load breakpoints", e);
			}
		}
	};

	const addBreakpoint = (bp: Breakpoint, vm?: VirtualMachine) => {
		// Prevent duplicates
		if (breakpoints.value.some((b) => b.type === bp.type && b.address === bp.address && b.endAddress === bp.endAddress))
			return;

		const newBp: BreakpointState = { ...bp, enabled: true };
		breakpoints.value.push(newBp);
		saveBreakpoints();
		vm?.addBP(bp.type, bp.address, bp.endAddress);
	};

	const removeBreakpoint = (bp: Breakpoint, vm?: VirtualMachine) => {
		const index = breakpoints.value.findIndex(
			(b) => b.type === bp.type && b.address === bp.address && b.endAddress === bp.endAddress,
		);
		if (index !== -1) {
			// Always remove from VM to ensure sync, regardless of enabled state
			vm?.removeBP(bp.type, bp.address, bp.endAddress);

			breakpoints.value.splice(index, 1);
			saveBreakpoints();
		}
	};

	const toggleBreakpoint = (bp: Breakpoint, vm?: VirtualMachine) => {
		const exists = breakpoints.value.some(
			(b) => b.type === bp.type && b.address === bp.address && b.endAddress === bp.endAddress,
		);
		if (exists) {
			removeBreakpoint(bp, vm);
		} else {
			addBreakpoint(bp, vm);
		}
	};

	const toggleBreakpointEnable = (bp: Breakpoint, vm?: VirtualMachine) => {
		const item = breakpoints.value.find(
			(b) => b.type === bp.type && b.address === bp.address && b.endAddress === bp.endAddress,
		);
		if (item) {
			item.enabled = !item.enabled;
			saveBreakpoints();
			if (item.enabled) {
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
		breakpoints,
		loadBreakpoints,
		addBreakpoint,
		removeBreakpoint,
		toggleBreakpoint,
		toggleBreakpointEnable,
		pcBreakpoints,
	};

	return result;
}
