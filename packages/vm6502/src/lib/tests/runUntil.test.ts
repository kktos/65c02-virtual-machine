import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { StopInfo } from "@/types/stopinfo.interface";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// A fake machine: each `play()` runs into the next stop of `stops` (or runs on, when there's none left).
// A stop is handed over as useMachine does: a breakpoint's after `takeHit` and its hook's command.
const isRunning = ref(false);
let stops: StopInfo[] = [];
let hooks: Record<number, () => void> = {};

const later = (ms: number, fn: () => void) => setTimeout(fn, ms);
const vm = {
	ready: Promise.resolve(),
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	lastStop: undefined as StopInfo | undefined,
	machineConfig: { name: "Apple //e" },
	playPending: false,
	get isRunningOrStarting() {
		return isRunning.value || vm.playPending;
	},
	play: vi.fn(() => {
		vm.playPending = true;
		later(1, () => {
			isRunning.value = true;
			vm.playPending = false;
		});
		const stop = stops.shift();
		if (stop) later(5, () => stopOn(stop));
	}),
	pause: vi.fn(() => {
		vm.playPending = false;
		stopOn({ reason: "pause" });
	}),
	addBP: vi.fn(),
	removeBP: vi.fn(),
	// Step over a JSR / step out: the worker runs, stops on the way as `stops` says
	stepOver: vi.fn(async (_through: boolean) => (vm.play(), { running: true })),
	stepOut: vi.fn(async (_through: boolean) => (vm.play(), { running: true })),
	endStepThrough: vi.fn(),
};

const stopOn = (stop: StopInfo) => {
	vm.lastStop = { ...stop }; // a new object per stop, like the real VM
	isRunning.value = false;
	if (stop.reason !== "breakpoint") return handleStop(vm as never, vm.lastStop);
	const bp = useBreakpoints().takeHit(stop.breakpointType, stop.address, vm as never);
	if (bp?.command) hooks[bp.address]?.();
	handleStop(vm as never, vm.lastStop);
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { findTool } = await import("@/lib/mcp/tools");
const { useBreakpoints } = await import("@/composables/useBreakpoints");
const { useRunUntil } = await import("@/composables/useRunUntil");
const { handleStop } = useRunUntil();

const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));
const runUntil = (input: Record<string, unknown>) => call("run_until", input);

const bpStop = (address: number, breakpointType = "pc"): StopInfo => ({
	reason: "breakpoint",
	breakpointType,
	address,
});
const stepThroughStop = (address: number): StopInfo => ({
	reason: "breakpoint",
	breakpointType: "pc",
	address,
	stepThrough: true,
});
const hasBp = (address: number) => !!useBreakpoints().getBreakpoint({ type: "pc", address });

describe("run_until", () => {
	beforeEach(async () => {
		isRunning.value = false;
		vm.playPending = false;
		vm.lastStop = undefined;
		vm.pause.mockClear();
		vm.play.mockClear();
		stops = [];
		hooks = {};
		useRunUntil().cancelRunUntil();
		await useBreakpoints().loadBreakpoints();
	});

	it("reached_address when the temporary breakpoint at `address` is hit; the breakpoint is gone", async () => {
		stops = [bpStop(0x300)];
		const result = await runUntil({ address: "$300" });
		expect(result).toMatchObject({ stopped: "reached_address", address: "$0300" });
		expect(result.pending_target).toBeUndefined();
		expect(hasBp(0x300)).toBe(false);
	});

	it("honour: a breakpoint on the way stops it, the target stays armed, the next run goes on to it", async () => {
		useBreakpoints().addBreakpoint({ type: "write", address: 0x2000 });
		stops = [bpStop(0x2000, "write"), bpStop(0x300)];
		expect(await runUntil({ address: "$300" })).toMatchObject({
			stopped: "breakpoint",
			breakpoint: { type: "write", address: "$2000" },
			pending_target: "$0300",
		});
		expect(hasBp(0x300)).toBe(true);
		expect(await call("get_registers")).toMatchObject({ pending_target: "$0300" });

		expect(await runUntil({})).toMatchObject({ stopped: "reached_address", address: "$0300" });
		expect(hasBp(0x300)).toBe(false);
	});

	it("through: a breakpoint on the way doesn't stop it", async () => {
		useBreakpoints().addBreakpoint({ type: "pc", address: 0x1000 });
		stops = [bpStop(0x1000), bpStop(0x300)];
		expect(await runUntil({ address: "$300", breakpoints: "through" })).toMatchObject({
			stopped: "reached_address",
		});
		expect(vm.play).toHaveBeenCalledTimes(2);
		expect(hasBp(0x1000)).toBe(true);
	});

	it("through ends on any other stop: the target stays armed, honouring the breakpoints", async () => {
		stops = [{ reason: "brk", address: 0x0003 }];
		expect(await runUntil({ address: "$300", breakpoints: "through" })).toMatchObject({
			stopped: "brk",
			pending_target: "$0300",
		});
		expect(useRunUntil().getRunUntilTarget()).toEqual({ address: 0x300, through: false });
	});

	it("a hook on the way (its command resumes the machine) doesn't end the wait", async () => {
		useBreakpoints().addBreakpoint({ type: "pc", address: 0x1000, command: "log x;run" });
		hooks[0x1000] = () => vm.play();
		stops = [bpStop(0x1000), bpStop(0x300)];
		expect(await runUntil({ address: "$300" })).toMatchObject({ stopped: "reached_address" });
	});

	it("the user's own breakpoint at the target is used, and kept", async () => {
		useBreakpoints().addBreakpoint({ type: "pc", address: 0x300 });
		stops = [bpStop(0x300)];
		expect(await runUntil({ address: "$300" })).toMatchObject({ stopped: "reached_address" });
		expect(hasBp(0x300)).toBe(true);
	});

	it("a reset drops the target", async () => {
		stops = [{ reason: "reset" }];
		expect(await runUntil({ address: "$300" })).toMatchObject({ stopped: "reset" });
		expect(useRunUntil().getRunUntilTarget()).toBeNull();
		expect(hasBp(0x300)).toBe(false);
	});

	it("through needs an address", async () => {
		await expect(runUntil({ breakpoints: "through" })).rejects.toThrow("through needs an address");
	});

	it("brk / error / hypercall", async () => {
		stops = [{ reason: "brk", address: 0x0003 }];
		expect(await runUntil({})).toMatchObject({ stopped: "brk", address: "$0003" });

		stops = [{ reason: "error", address: 0x1234, message: "Unimplemented opcode 02" }];
		expect(await runUntil({})).toMatchObject({
			stopped: "error",
			address: "$1234",
			message: "Unimplemented opcode 02",
		});

		stops = [{ reason: "hypercall", address: 0x0800, cmd: 0x02 }];
		expect(await runUntil({})).toMatchObject({ stopped: "hypercall", command: "LOG_REGS", address: "$0800" });
	});

	it("timeout: pauses and says so", async () => {
		expect(await runUntil({ timeout_ms: 30 })).toMatchObject({ stopped: "timeout (paused)", running: false });
		expect(vm.pause).toHaveBeenCalled();
	});

	it("get_registers reports the last stop when not running", async () => {
		vm.lastStop = { reason: "brk", address: 0x0003 };
		expect(await call("get_registers")).toMatchObject({
			running: false,
			last_stop: { stopped: "brk", address: "$0003" },
		});
		isRunning.value = true;
		expect((await call("get_registers")).last_stop).toBeUndefined();
	});
});

describe("step over / out", () => {
	const step = (input: Record<string, unknown>) => call("step", input);

	beforeEach(async () => {
		isRunning.value = false;
		vm.playPending = false;
		vm.lastStop = undefined;
		vm.play.mockClear();
		vm.endStepThrough.mockClear();
		stops = [];
		hooks = {};
		useRunUntil().cancelRunUntil();
		await useBreakpoints().loadBreakpoints();
	});

	it("through: the main thread resumes from the breakpoints the worker flags", async () => {
		useBreakpoints().addBreakpoint({ type: "pc", address: 0x1000 });
		stops = [stepThroughStop(0x1000), { reason: "step", address: 0x303 }];
		expect(await step({ mode: "over", breakpoints: "through" })).toMatchObject({
			stopped: "step",
			address: "$0303",
		});
		expect(vm.stepOver).toHaveBeenLastCalledWith(true);
		expect(vm.play).toHaveBeenCalledTimes(2);
		expect(vm.endStepThrough).not.toHaveBeenCalled();
	});

	it("honour: a breakpoint on the way stops it", async () => {
		useBreakpoints().addBreakpoint({ type: "pc", address: 0x1000 });
		stops = [bpStop(0x1000)];
		expect(await step({ mode: "out" })).toMatchObject({
			stopped: "breakpoint",
			breakpoint: { type: "pc", address: "$1000" },
		});
		expect(vm.stepOut).toHaveBeenLastCalledWith(false);
	});

	it("through, stopping on a run until's target: the step goes on honouring the breakpoints", async () => {
		vm.playPending = true; // armed only: the step is what runs
		useRunUntil().startRunUntil(vm as never, 0x300);
		vm.playPending = false;
		stops = [stepThroughStop(0x300)];
		expect(await step({ mode: "out", breakpoints: "through" })).toMatchObject({ stopped: "breakpoint" });
		expect(vm.endStepThrough).toHaveBeenCalled();
		expect(useRunUntil().getRunUntilTarget()).toBeNull();
	});

	it("over, not on a JSR: a single step, without waiting", async () => {
		vm.stepOver.mockResolvedValueOnce({ running: false, step: { executed: 1, address: 0x304 } } as never);
		const started = Date.now();
		expect(await step({ mode: "over" })).toMatchObject({ executed: 1 });
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it("checks its arguments", async () => {
		await expect(step({ mode: "sideways" })).rejects.toThrow("mode: must be into, over or out");
		await expect(step({ mode: "over", count: 2 })).rejects.toThrow("count: only with mode into");
		await expect(step({ breakpoints: "through" })).rejects.toThrow("breakpoints: only with mode over / out");
	});
});
