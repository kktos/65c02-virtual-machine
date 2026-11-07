import { ref } from "vue";

// Shared state
const jumpEvent = ref<{ address: number } | null>(null);

/**
 * Navigation requests the disassembly view already applied. Module level, so it survives the view's unmount:
 * a request made while the view is hidden (e.g. memory viewer tab) is applied once, when it mounts again.
 */
const appliedRequests = new WeakSet<object>();

/** Last VM the disassembly view was initialised for: a remount (tab switch) is not a machine load */
let lastVm: object | null = null;
const isNewVm = (vm: object) => {
	if (vm === lastVm) return false;
	lastVm = vm;
	return true;
};
const takeUnapplied = <T extends object>(request: T | null | undefined): T | null => {
	if (!request || appliedRequests.has(request)) return null;
	appliedRequests.add(request);
	return request;
};

export function useDisassembly() {
	const requestJump = (address: number) => {
		jumpEvent.value = { address };
	};

	return {
		jumpEvent,
		requestJump,
		takeUnapplied,
		isNewVm,
	};
}
