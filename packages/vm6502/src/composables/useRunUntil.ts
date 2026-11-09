import type { StopInfo } from "@/types/stopinfo.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useBreakpoints } from "./useBreakpoints";

/**
 * Run until: run to an address, a temporary PC breakpoint set there (or the user's own, if there is one).
 * - honour (the default): the other breakpoints stop the machine on the way. The target stays armed, so a
 *   plain `run` goes on to it.
 * - through: the other breakpoints don't stop it; their hooks still run. That lasts until the machine stops
 *   for something else (pause, BRK, error, hypercall, step): from there on, it is an honour run until.
 * The target is dropped when reached, on a reset, when its breakpoint is removed or turned off, and when a new
 * run until replaces it.
 *
 * Step over / step out going through: the same, for the breakpoints met before the step's end. The worker keeps
 * that step (and flags its breakpoint stops `stepThrough`); it resumes from here.
 *
 * It also tells a stop from a stop the machine goes on from: on a breakpoint, the worker stops and the main
 * thread decides (a hook's command, which ends with `run`; a run until or a step going through). `onSettledStop`
 * only hears the stops the machine stays stopped on.
 */
export type RunUntilTarget = { address: number; through: boolean };

let target: (RunUntilTarget & { temporary: boolean }) | null = null;
const settledListeners = new Set<(stop: StopInfo) => void>();

/** `address` as typed may leave out the bank; stop addresses are physical ((bank << 16) | address). */
export const isSameAddress = (physical: number, address: number) =>
	physical === address || (address <= 0xffff && (physical & 0xffff) === address);

const targetKey = (address: number) => ({ type: "pc" as const, address });

/** The armed target. One whose breakpoint was removed or turned off by the user is dropped. */
const getTarget = () => {
	if (target && !useBreakpoints().getBreakpoint(targetKey(target.address))?.enabled) target = null;
	return target;
};

/** Drops the target, and its breakpoint when run until set it. */
const cancelRunUntil = (vm?: VirtualMachine) => {
	const was = target;
	target = null;
	if (!was?.temporary) return;
	const { getBreakpoint, removeBreakpoint } = useBreakpoints();
	const bp = getBreakpoint(targetKey(was.address));
	if (bp?.isTemporary) removeBreakpoint(bp, vm);
};

/** Arms the target (replacing the previous one) and runs the machine, unless it already runs. */
const startRunUntil = (vm: VirtualMachine, address: number, { through = false } = {}) => {
	cancelRunUntil(vm);
	const { getBreakpoint, addBreakpoint } = useBreakpoints();
	const existing = getBreakpoint(targetKey(address));
	if (existing && !existing.enabled)
		throw new Error("The breakpoint there is turned off: turn it on (BE) or remove it (BC) first.");
	if (!existing) addBreakpoint({ ...targetKey(address), isTemporary: true }, vm);
	target = { address, through, temporary: !existing };
	if (!vm.isRunningOrStarting) vm.play();
};

/**
 * Every stop goes through here, once the main thread is done with it: at once for most, after the hook's
 * command for a breakpoint. Resumes a run until or a step going through a breakpoint; otherwise tells the
 * listeners, unless the machine was resumed (a hook).
 */
const handleStop = (vm: VirtualMachine, stop: StopInfo) => {
	if (stop.reason === "reset") cancelRunUntil(vm);
	const onBreakpoint = stop.reason === "breakpoint";
	// Reached: on `target`, not getTarget(), which drops it once takeHit has removed its temporary breakpoint
	if (target && onBreakpoint && stop.breakpointType === "pc" && isSameAddress(stop.address, target.address))
		target = null;
	else {
		const armed = getTarget();
		if (onBreakpoint && (armed?.through || stop.stepThrough)) {
			if (!vm.isRunningOrStarting) vm.play();
			return;
		}
		if (armed) armed.through = false;
	}
	// Stays on a breakpoint a step went through (the run until's target): the step goes on honouring them
	if (onBreakpoint && stop.stepThrough) vm.endStepThrough();
	if (vm.isRunningOrStarting) return;
	for (const cb of settledListeners) cb(stop);
};

/** Calls `cb` on each stop the machine stays stopped on. Returns the unsubscribe function. */
const onSettledStop = (cb: (stop: StopInfo) => void) => {
	settledListeners.add(cb);
	return () => {
		settledListeners.delete(cb);
	};
};

export function useRunUntil() {
	return {
		/** The armed target, if any. */
		getRunUntilTarget: (): RunUntilTarget | null => {
			const t = getTarget();
			return t && { address: t.address, through: t.through };
		},
		startRunUntil,
		cancelRunUntil,
		handleStop,
		onSettledStop,
	};
}
