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
	setBreakpointEnabled: (bp: Breakpoint, enabled: boolean, vm?: VirtualMachine) => boolean;
	getBreakpoint: (bp: Breakpoint) => BreakpointState | undefined;
	getBreakpointKey: (bp: Breakpoint) => string;
	findHitBreakpoints: (type: string, address: number) => BreakpointState[];
	takeHit: (type: string, address: number, vm?: VirtualMachine) => BreakpointState | undefined;
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

	/**
	 * Takes a breakpoint out of the worker. The worker keeps one set of flags per address, not who set them: clearing
	 * `bp`'s flags also clears those of the other enabled breakpoints overlapping it (a BPR inside a BPA range), so
	 * they are set again. `bp` must already be out of the enabled ones.
	 */
	const unsetInVm = (bp: Breakpoint, vm?: VirtualMachine) => {
		if (!vm) return;
		vm.removeBP(bp.type, bp.address, bp.endAddress);
		const lo = bp.address;
		const hi = bp.endAddress ?? bp.address;
		breakpoints.value.forEach((other) => {
			if (other.enabled && other.address <= hi && (other.endAddress ?? other.address) >= lo)
				vm.addBP(other.type, other.address, other.endAddress);
		});
	};

	const removeBreakpoint = (bp: Breakpoint, vm?: VirtualMachine) => {
		const key = getBreakpointKey(bp);
		if (breakpoints.value.has(key)) {
			breakpoints.value.delete(key);
			saveBreakpoints();
			// Always remove from VM to ensure sync, regardless of enabled state
			unsetInVm(bp, vm);
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

	/** Returns false when there is no such breakpoint, or it already was in that state. */
	const setBreakpointEnabled = (bp: Breakpoint, enabled: boolean, vm?: VirtualMachine) => {
		const key = getBreakpointKey(bp);
		const item = breakpoints.value.get(key);
		if (!item || item.enabled === enabled) return false;
		breakpoints.value.set(key, { ...item, enabled });
		saveBreakpoints();
		if (enabled) vm?.addBP(item.type, item.address, item.endAddress);
		else unsetInVm(item, vm);
		return true;
	};

	const toggleBreakpointEnable = (bp: Breakpoint, vm?: VirtualMachine) => {
		const item = getBreakpoint(bp);
		if (item) setBreakpointEnabled(item, !item.enabled, vm);
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
					bp.enabled &&
					types.includes(bp.type) &&
					bp.address <= address &&
					(bp.endAddress ?? bp.address) >= address,
			)
			.sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type) || span(a) - span(b));
	};

	/**
	 * The worker stopped on a breakpoint: returns the one that decides what happens (its command runs, or the machine
	 * stays stopped), the most specific of those hit, so a plain breakpoint stops even inside a hooked range.
	 * The temporary ones hit are removed; a `once` one is turned off if it is the one deciding, before its command
	 * runs, so the `run` the hooks end with doesn't stop on it again.
	 */
	const takeHit = (type: string, address: number, vm?: VirtualMachine) => {
		// The hit may fall inside a range, or come from an `access` breakpoint (reported as read / write).
		const hits = findHitBreakpoints(type, address);
		for (const hit of hits) if (hit.isTemporary) removeBreakpoint(hit, vm);
		const bp = hits[0];
		if (bp?.once) setBreakpointEnabled(bp, false, vm);
		return bp;
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
		setBreakpointEnabled,
		getBreakpoint,
		findHitBreakpoints,
		takeHit,
		pcBreakpoints,
	};

	return result;
}
