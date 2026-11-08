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
	updateBreakpointCommand: (bp: Breakpoint, newCommand: string) => void;
	toggleBreakpoint: (bp: Breakpoint, vm?: VirtualMachine) => void;
	toggleBreakpointEnable: (bp: Breakpoint, vm?: VirtualMachine) => void;
	getBreakpoint: (bp: Breakpoint) => BreakpointState | undefined;
	getBreakpointKey: (bp: Breakpoint) => string;
	findHitBreakpoints: (type: string, address: number) => BreakpointState[];
	pcBreakpoints: ComputedRef<Map<number, boolean>>;
};

export function useBreakpoints(): UseBreakpointsResult {
	const saveBreakpoints = () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(breakpoints.value.values())));
	};

	const loadBreakpoints = async (vm?: VirtualMachine) => {
		const newMap = new Map<string, BreakpointState>();
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const loaded: BreakpointState[] = JSON.parse(stored).map((bp: BreakpointState) => ({
					...bp,
					enabled: bp.enabled ?? true,
				}));

				loaded.forEach((bp) => {
					newMap.set(getBreakpointKey(bp), bp);
				});
			} catch (e) {
				console.error("Failed to load breakpoints", e);
			}
		}

		breakpoints.value = newMap;

		if (breakpoints.value.size && vm) {
			await vm.ready;
			breakpoints.value.forEach((bp) => {
				if (bp.enabled) vm.addBP(bp.type, bp.address, bp.endAddress);
			});
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

	const updateBreakpointCommand = (bp: Breakpoint, newCommand: string) => {
		const key = getBreakpointKey(bp);
		const item = breakpoints.value.get(key);
		if (item) {
			const updatedItem = { ...item, command: newCommand.trim() };
			breakpoints.value.set(key, updatedItem);
			saveBreakpoints();
		}
	};

	const toggleBreakpoint = (bp: Breakpoint, vm?: VirtualMachine) => {
		const key = getBreakpointKey(bp);
		if (breakpoints.value.has(key)) removeBreakpoint(bp, vm);
		else addBreakpoint(bp, vm);
	};

	const toggleBreakpointEnable = (bp: Breakpoint, vm?: VirtualMachine) => {
		const key = getBreakpointKey(bp);
		const item = breakpoints.value.get(key);
		if (item) {
			const updatedItem = { ...item, enabled: !item.enabled };
			breakpoints.value.set(key, updatedItem);
			saveBreakpoints();
			if (updatedItem.enabled) vm?.addBP(item.type, item.address, item.endAddress);
			else vm?.removeBP(item.type, item.address, item.endAddress);
		}
	};

	const getBreakpoint = (bp: Breakpoint): BreakpointState | undefined => {
		return breakpoints.value.get(getBreakpointKey(bp));
	};

	/**
	 * The enabled breakpoints the worker may have stopped on: `type` is what it reports (`pc`, `read`, `write`;
	 * `access` breakpoints stop as `read` or `write`), `address` the physical address hit (the byte accessed for
	 * read / write, so it can be anywhere in a range). Most specific first: same type before `access`, then the
	 * narrowest range.
	 */
	const findHitBreakpoints = (type: string, address: number): BreakpointState[] => {
		const types = type === "read" || type === "write" ? [type, "access"] : [type];
		const span = (bp: Breakpoint) => (bp.endAddress ?? bp.address) - bp.address;
		return Array.from(breakpoints.value.values())
			.filter(
				(bp) =>
					bp.enabled && types.includes(bp.type) && bp.address <= address && (bp.endAddress ?? bp.address) >= address,
			)
			.sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type) || span(a) - span(b));
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
		getBreakpointKey,
		loadBreakpoints,
		addBreakpoint,
		removeBreakpoint,
		updateBreakpointCommand,
		toggleBreakpoint,
		toggleBreakpointEnable,
		getBreakpoint,
		findHitBreakpoints,
		pcBreakpoints,
	};

	return result;
}
