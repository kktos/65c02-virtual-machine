import type { Video } from "@/types/video.interface";
import type { StepResult, StopInfo } from "@/types/stopinfo.interface";
import {
	addBreakpoint,
	BP_PC,
	BP_READ,
	BP_WRITE,
	BreakpointError,
	bankedBreakpoints,
	breakOnBrk,
	breakpointMap,
	cleanStepBP,
	clearBreakpoints,
	removeBreakpoint,
	setBreakOnBrk,
	setStepAddedBreakpoint,
	setStepBPAddress,
	stepBPAddress,
} from "./breakpoints";
import type { IBus } from "../../types/bus.interface";
import {
	FLAG_5_MASK,
	FLAG_B_MASK,
	FLAG_N_MASK,
	FLAG_Z_MASK,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_SPEED_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "./shared-memory";
import { decodeHypercall } from "@/lib/hypercalls.lib";
import { instructionTraceOn, recordInstruction } from "./instructionTrace";
import type { CpuRegisters } from "./cpuRegisters";

const STACK_PAGE_HI = 0x0100;

// --- Emulator State ---
let isRunning = false;
// Step out: stop on the RTS / RTI that brings SP back to (or above) this. Like the step over's breakpoint, it stays
// armed when something else stops the machine on the way; dropped when reached, on reset / restore, by a new step.
let stepOutTargetSP: number | null = null;
// The step over / out under way goes through the breakpoints: they still stop the worker (the main thread runs
// their hook), flagged `stepThrough` for the main thread to resume. Until the machine stops for something else.
let stepThrough = false;
let clockSpeedMhz = 1; // Default to 1 MHz

// At max speed, a slice runs for this long before the worker yields (to take its messages, to draw a frame)...
const MAX_SPEED_SLICE_MS = 8;
// ...and this many cycles at most (when the clock doesn't move, as in the tests)
const MAX_SPEED_SLICE_CYCLES = 4_000_000;
// The clock is read every this many cycles
const MAX_SPEED_CLOCK_CHECK = 20_000;
// No frame drawn for this long (the frame callback starved by the slices): the run loop draws one itself
const FRAME_FALLBACK_MS = 50;

// Each `setRunning(true)` starts a new run loop (and frame loop): the slices and frames scheduled by an older one
// are dropped, so that there is only ever one of each.
let runGeneration = 0;
let lastFrameTime = 0;
// Max speed yields through a MessageChannel: a nested setTimeout(0) waits ~4 ms, as long as a slice runs
let sliceChannel: MessageChannel | null = null;

// Performance tracking
let lastPerfTime = 0;
let cyclesSinceLastPerf = 0;
let lastRunTime = 0;
let cycleAccumulator = 0;

// --- Trace State ---
let traceEnabled = false;
const traceHistory: { type: string; source: number; target: number }[] = [];
let maxTraceSize = 200;

// Shared memory references, to be initialized from the worker
let registersView: DataView | null = null;

// The registers. While the CPU executes (`registersLive`: a run slice, a step), these are the truth: loaded from the
// shared view at its start, written back at its end and before a stop is posted. Otherwise the view is.
let regA = 0;
let regX = 0;
let regY = 0;
let regSP = 0;
let regP = 0;
let regPC = 0;
let registersLive = false;

function loadRegisters(view: DataView) {
	regA = view.getUint8(REG_A_OFFSET);
	regX = view.getUint8(REG_X_OFFSET);
	regY = view.getUint8(REG_Y_OFFSET);
	regSP = view.getUint8(REG_SP_OFFSET);
	regP = view.getUint8(REG_STATUS_OFFSET);
	regPC = view.getUint16(REG_PC_OFFSET, true);
	registersLive = true;
}

function storeRegisters(view: DataView) {
	view.setUint8(REG_A_OFFSET, regA);
	view.setUint8(REG_X_OFFSET, regX);
	view.setUint8(REG_Y_OFFSET, regY);
	view.setUint8(REG_SP_OFFSET, regSP);
	view.setUint8(REG_STATUS_OFFSET, regP);
	view.setUint16(REG_PC_OFFSET, regPC, true);
}

/** The registers for the devices (CpuRegisters): the CPU's own while it executes, the view's otherwise. */
const cpuRegisters: CpuRegisters = {
	get a() {
		return registersLive ? regA : (registersView?.getUint8(REG_A_OFFSET) ?? 0);
	},
	set a(value) {
		if (registersLive) regA = value & 0xff;
		else registersView?.setUint8(REG_A_OFFSET, value);
	},
	get x() {
		return registersLive ? regX : (registersView?.getUint8(REG_X_OFFSET) ?? 0);
	},
	set x(value) {
		if (registersLive) regX = value & 0xff;
		else registersView?.setUint8(REG_X_OFFSET, value);
	},
	get y() {
		return registersLive ? regY : (registersView?.getUint8(REG_Y_OFFSET) ?? 0);
	},
	set y(value) {
		if (registersLive) regY = value & 0xff;
		else registersView?.setUint8(REG_Y_OFFSET, value);
	},
	get p() {
		return registersLive ? regP : (registersView?.getUint8(REG_STATUS_OFFSET) ?? 0);
	},
	set p(value) {
		if (registersLive) regP = value & 0xff;
		else registersView?.setUint8(REG_STATUS_OFFSET, value);
	},
	get sp() {
		return registersLive ? regSP : (registersView?.getUint8(REG_SP_OFFSET) ?? 0);
	},
	set sp(value) {
		if (registersLive) regSP = value & 0xff;
		else registersView?.setUint8(REG_SP_OFFSET, value);
	},
	get pc() {
		return registersLive ? regPC : (registersView?.getUint16(REG_PC_OFFSET, true) ?? 0);
	},
};
let memoryView: Uint8Array | null = null;
let stackMetadataView: Uint8Array;
let bus: IBus | null = null;
let video: Video | null = null;

// Status Flag Masks (complementing those from shared-memory)
const FLAG_C_MASK = 0x01;
const FLAG_I_MASK = 0x04;
const FLAG_D_MASK = 0x08;
// const FLAG_B_MASK = 0x10;
const FLAG_V_MASK = 0x40;

// `BRK <cmd>` hypercalls, per machine (MachineConfig.hypercalls)
let hypercallsEnabled = false;
export const setHypercalls = (enabled: boolean) => (hypercallsEnabled = enabled);

// PC of the BRK the CPU stopped on ("break on BRK"), so that resuming executes it instead of stopping again
let stoppedOnBrkAt: number | null = null;

// Set by whatever stops a step early (an error, a hypercall with the stop bit): read by `stepInstructions`.
let stepStop: StopInfo | undefined;
export const isStoppedOnBrk = () =>
	stoppedOnBrkAt !== null && stoppedOnBrkAt === registersView?.getUint16(REG_PC_OFFSET, true);

// PC of the instruction a read / write breakpoint stopped (it is run again from its start): resuming executes it
// without the breakpoint check, or the same access would stop it again at once
let stoppedOnAccessAt: number | null = null;
export const isStoppedOnAccess = () =>
	stoppedOnAccessAt !== null && stoppedOnAccessAt === registersView?.getUint16(REG_PC_OFFSET, true);

// PC of the breakpoint the machine resumes from: the run executes that instruction without stopping on it again.
// Run, not stepped: what it ends (a step out's RTS) stops the machine as it would anywhere else.
let resumeFromBreakpointAt: number | null = null;
/** Resuming from the PC breakpoint the machine is stopped on: the next run doesn't stop on it again at once. */
export const skipBreakpointOnce = (pc: number) => (resumeFromBreakpointAt = pc);

// --- Interrupts ---
// The IRQ line is level-triggered: held by the devices (the bus ORs them) until the handler acknowledges them.
// The NMI is edge-triggered: one pending NMI per falling edge. Both are taken at the end of an instruction.
let irqLine = false;
let nmiPending = false;
/** The IRQ line, as the machine's devices drive it (true: asserted). */
export const setIrqLine = (active: boolean) => (irqLine = active);
/** An NMI edge: the CPU takes it at the end of the current instruction. */
export const triggerNmi = () => (nmiPending = true);

// Re-export breakpoint functions for external use
export { addBreakpoint, removeBreakpoint, clearBreakpoints, setBreakOnBrk };

export function initCPU(
	systemBus: IBus,
	regView: DataView,
	videoSystem: Video | null,
	memView: Uint8Array,
	stackMetaView: Uint8Array,
) {
	bus = systemBus;
	registersView = regView;
	video = videoSystem;
	memoryView = memView;
	stackMetadataView = stackMetaView;
	if (clockSpeedMhz > 0) registersView.setFloat64(REG_SPEED_OFFSET, clockSpeedMhz, true);

	// Wrap bus methods to check for breakpoints
	const originalRead = bus.read.bind(bus);
	bus.read = (address: number, isOpcodeFetch = false): number => {
		// Fast check
		// biome-ignore lint/style/noNonNullAssertion: <expected>
		if (!isOpcodeFetch && isRunning && breakpointMap[address]! & BP_READ) {
			// Potential hit, do detailed check
			const bank = bus?.getBank?.(address) ?? 0;
			const physicalAddress = (bank << 16) | address;

			// biome-ignore lint/style/noNonNullAssertion: <expected>
			if (bankedBreakpoints.get(physicalAddress)! & BP_READ) {
				throw new BreakpointError("read", physicalAddress);
			}
		}

		return originalRead(address, isOpcodeFetch);
	};

	const originalWrite = bus.write.bind(bus);
	bus.write = (address: number, value: number): void => {
		// biome-ignore lint/style/noNonNullAssertion: <expected>
		if (isRunning && breakpointMap[address]! & BP_WRITE) {
			const bank = bus?.getBank?.(address) ?? 0;
			const physicalAddress = (bank << 16) | address;

			// biome-ignore lint/style/noNonNullAssertion: <expected>
			if (bankedBreakpoints.get(physicalAddress)! & BP_WRITE) throw new BreakpointError("write", physicalAddress);
		}
		originalWrite(address, value);
	};

	// The devices that read or set the registers during an instruction
	bus.setCpuRegisters?.(cpuRegisters);

	resetCPU();
}

/** `stop` (why it stopped) is only meaningful when `running` is false. */
export function setRunning(running: boolean, stop?: StopInfo) {
	isRunning = running;
	if (running) stoppedOnAccessAt = null;
	if (!running && stop) stepStop = stop;
	if (!running && stop?.reason !== "breakpoint") stepThrough = false;
	// Stopped by the instruction under way: the main thread reads the registers as it gets the message
	if (!running && registersLive && registersView) storeRegisters(registersView);
	self.postMessage({ type: "isRunning", isRunning: running, stop: running ? undefined : stop });
	if (isRunning) {
		lastPerfTime = performance.now();
		cyclesSinceLastPerf = 0;
		lastRunTime = performance.now();
		lastFrameTime = lastRunTime;
		cycleAccumulator = 0;
		const generation = ++runGeneration;
		run(generation);
		vblrun(generation);
	}
}

/**
 * Before a save state is put back: the machine is stopped (as paused) and forgets where it was
 * (stopped on a BRK, stepping out), which belonged to the state being replaced.
 */
export function prepareForRestore() {
	stoppedOnBrkAt = null;
	stoppedOnAccessAt = null;
	if (isRunning) setRunning(false, { reason: "pause" });
	dropStep();
}

/** Forgets the step over / out under way (its breakpoint, its stack level). */
function dropStep() {
	if (stepBPAddress !== null) cleanStepBP();
	stepOutTargetSP = null;
	stepThrough = false;
}

/** The step over / out under way honours the breakpoints from now on (the main thread stays on one). */
export const endStepThrough = () => (stepThrough = false);

/** A breakpoint stop; flagged when a step over / out goes through it. */
const breakpointStop = (breakpointType: string, address: number): StopInfo => ({
	reason: "breakpoint",
	breakpointType,
	address,
	...(stepThrough && { stepThrough: true }),
});

export function setClockSpeed(speed: number) {
	if (speed >= 0) {
		clockSpeedMhz = speed;
		if (clockSpeedMhz > 0) registersView?.setFloat64(REG_SPEED_OFFSET, clockSpeedMhz, true);
	}
}

export function setTrace(enabled: boolean) {
	traceEnabled = enabled;
}

export function setTraceSize(size: number) {
	maxTraceSize = size;
}

export function getTrace() {
	return traceHistory;
}

export function clearTrace() {
	traceHistory.length = 0;
}

function logTrace(type: string, source: number, target: number) {
	if (!traceEnabled) return;
	const sourceFullAddr = ((bus?.getBank?.(source) ?? 0) << 16) | source;
	const targetFullAddr = ((bus?.getBank?.(target) ?? 0) << 16) | target;
	traceHistory.push({ type, source: sourceFullAddr, target: targetFullAddr });
	if (traceHistory.length > maxTraceSize) traceHistory.shift();
}

/**
 * Steps over a JSR: runs to the instruction after it (undefined). Anything else is a single step: its result.
 */
export function stepOverInstruction(through = false): StepResult | undefined {
	if (isRunning || !registersView || !bus) return stepInstructions(0); // nothing done, where it is

	// Replaces the step over / out still armed (stopped on the way)
	dropStep();

	const pc = registersView.getUint16(REG_PC_OFFSET, true);
	const opcode = bus.read(pc, true);

	if (opcode === 0x20) {
		// JSR Absolute
		const logicalTarget = (pc + 3) & 0xffff;
		const bank = bus.getBank?.(pc) ?? 0;
		const physicalTarget = (bank << 16) | logicalTarget;

		setStepBPAddress(physicalTarget);
		// biome-ignore lint/style/noNonNullAssertion: <expected>
		const added = !bankedBreakpoints.has(physicalTarget) || (bankedBreakpoints.get(physicalTarget)! & BP_PC) === 0;
		setStepAddedBreakpoint(added);
		if (added) addBreakpoint("pc", physicalTarget);

		stepInstruction();
		stepThrough = through;
		setRunning(true);
		return undefined;
	}
	return stepInstructions(1);
}

/** Runs until the current routine returns (an RTS / RTI back above the current stack level). False when it can't. */
export function stepOutInstruction(through = false) {
	if (isRunning || !registersView || !bus) return false;

	// Replaces the step over / out still armed (stopped on the way)
	dropStep();

	stepOutTargetSP = registersView.getUint8(REG_SP_OFFSET);
	stepThrough = through;
	// Stopped on a BRK ("break on BRK") or by a read / write breakpoint: execute that instruction first, as `run`
	// does, or the run would stop on it again at once (a second BRK stop for the same BRK). A BRK's handler
	// returns with an RTI to this stack level, which doesn't end the step out: the routine's own RTS does.
	if (isStoppedOnBrk() || isStoppedOnAccess()) stepInstruction();
	else skipBreakpointOnce(registersView.getUint16(REG_PC_OFFSET, true)); // started on a breakpoint: not stopped there
	setRunning(true);
	return true;
}

export function stepInstruction() {
	if (isRunning) return;
	const cycles = executeInstruction();
	if (bus?.tick) bus.tick(cycles);
	if (video && memoryView) video.tick();
	if (bus?.syncState) bus.syncState();
}

/**
 * Up to `count` instructions, each like a single step (BRKs execute, memory breakpoints don't fire).
 * Stops early, after an instruction, on: an error (unimplemented opcode), a hypercall with the stop bit,
 * or an enabled PC breakpoint on the next instruction.
 */
export function stepInstructions(count: number): StepResult {
	const physicalPC = () => {
		const pc = registersView?.getUint16(REG_PC_OFFSET, true) ?? 0;
		return ((bus?.getBank?.(pc) ?? 0) << 16) | pc;
	};
	if (isRunning || !registersView || !bus) return { executed: 0, address: physicalPC() };
	if (count === 1) {
		stepStop = undefined;
		stepInstruction();
		const stop = stepStop as StopInfo | undefined; // set by the instruction, not visible to TS's narrowing
		return { executed: 1, address: physicalPC(), ...(stop && { stop }) };
	}

	// Like the run loop: the bus ticks per instruction, the screen is rendered once, at the end.
	let executed = 0;
	let stop: StopInfo | undefined;
	while (executed < count) {
		stepStop = undefined;
		bus.tick?.(executeInstruction());
		executed++;
		stop = stepStop as StopInfo | undefined; // set by the instruction
		if (stop) break;
		if (executed === count) break;

		const pc = registersView.getUint16(REG_PC_OFFSET, true);
		if (breakpointMap[pc]! & BP_PC) {
			const address = physicalPC();
			if (bankedBreakpoints.get(address)! & BP_PC) {
				stop = { reason: "breakpoint", breakpointType: "pc", address };
				break;
			}
		}
	}
	if (video && memoryView) video.tick();
	bus.syncState?.();
	return { executed, address: physicalPC(), ...(stop && { stop }) };
}

export function resetCPU() {
	if (!registersView || !bus) return;

	if (video) video.reset();

	stackMetadataView.fill(0);
	nmiPending = false;

	// The 6502's reset sequence
	// Set Stack Pointer to 0xFD
	registersView.setUint8(REG_SP_OFFSET, 0xfd);

	// Set the Interrupt Disable flag
	let status = registersView.getUint8(REG_STATUS_OFFSET);
	status |= FLAG_I_MASK;
	registersView.setUint8(REG_STATUS_OFFSET, status);

	// Read the reset vector from memory ($FFFC and $FFFD)
	const lo = bus.read(0xfffc);
	const hi = bus.read(0xfffd);
	registersView.setUint16(REG_PC_OFFSET, (hi << 8) | lo, true);

	// Stop execution
	setRunning(false, { reason: "reset" });

	dropStep();
}

/** The machine's frame: the bus state for the UI, the screen drawn. */
function drawFrame() {
	lastFrameTime = performance.now();
	bus?.syncState?.();
	video?.tick(bus);
}

function vblrun(generation: number) {
	if (generation !== runGeneration) return;
	drawFrame();
	if (isRunning) requestAnimationFrame(() => vblrun(generation));
}

/** The next slice of the run loop `generation`: paced by a timer, or at once at max speed. */
function scheduleSlice(generation: number) {
	// At a set speed, the slices are sized by the time gone by: the timer's ~4 ms delay is no loss
	if (clockSpeedMhz > 0) {
		setTimeout(() => run(generation), 0);
		return;
	}
	if (!sliceChannel) {
		sliceChannel = new MessageChannel();
		sliceChannel.port1.onmessage = (event: MessageEvent<number>) => run(event.data);
	}
	sliceChannel.port2.postMessage(generation);
}

/**
 * Runs instructions for up to `budget` cycles, the bus ticked after each one: their cycles. Less when the machine
 * stops (or starts) on the way. The registers are loaded from the shared view first, written back after.
 */
export function runCycles(budget: number): number {
	if (!registersView || !bus) return 0;
	const systemBus = bus;
	const running = isRunning;
	let cyclesLeft = budget;
	loadRegisters(registersView);
	try {
		while (cyclesLeft > 0) {
			const cycles = execute();
			systemBus.tick(cycles);
			cyclesLeft -= cycles;
			if (isRunning !== running) break;
		}
	} finally {
		storeRegisters(registersView);
		registersLive = false;
	}
	return budget - cyclesLeft;
}

// --- Main Execution Loop ---
function run(generation: number) {
	if (generation !== runGeneration || !isRunning || !registersView || !bus) return;

	const start = performance.now();
	let executed = 0;

	if (clockSpeedMhz > 0) {
		// Cap delta time to 50ms to prevent "spiral of death" if tab was backgrounded
		const dt = Math.min(start - lastRunTime, 50);
		lastRunTime = start;

		// Calculate cycles needed: MHz * 1000 = cycles/ms
		cycleAccumulator += clockSpeedMhz * 1000 * dt;
		const cyclesThisSlice = Math.floor(cycleAccumulator);
		cycleAccumulator -= cyclesThisSlice;
		executed = runCycles(cyclesThisSlice);
	} else {
		// As many as fit in the slice's time
		do executed += runCycles(MAX_SPEED_CLOCK_CHECK);
		while (isRunning && executed < MAX_SPEED_SLICE_CYCLES && performance.now() - start < MAX_SPEED_SLICE_MS);
	}

	const now = performance.now();
	cyclesSinceLastPerf += executed;
	if (now - lastPerfTime >= 1000) {
		const elapsedSec = (now - lastPerfTime) / 1000;
		const effectiveMhz = cyclesSinceLastPerf / elapsedSec / 1000000;
		registersView.setFloat64(REG_SPEED_OFFSET, effectiveMhz, true);
		lastPerfTime = now;
		cyclesSinceLastPerf = 0;
	}

	if (!isRunning) return;
	// The frame callback can starve behind back-to-back slices: a frame drawn here then
	if (now - lastFrameTime >= FRAME_FALLBACK_MS) drawFrame();
	scheduleSlice(generation);
}

function setNZFlags(value: number) {
	let status = regP;
	status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
	status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
	regP = status & 0xff;
}

function adc(value: number) {
	const accumulator = regA;
	let status = regP;
	const carry = status & FLAG_C_MASK;

	if (status & FLAG_D_MASK) {
		// Decimal Mode
		let result = (accumulator & 0x0f) + (value & 0x0f) + carry;
		if (result > 9) result += 6;
		result += (accumulator & 0xf0) + (value & 0xf0);

		status = ~(accumulator ^ value) & (accumulator ^ result) & 0x80 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;
		status = result >= 0xa0 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;

		if (result >= 0xa0) result += 0x60;

		status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
		status = result & 0xff & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

		regA = result & 0xff;
		regP = status & 0xff;
	} else {
		// Binary Mode
		const result = accumulator + value + carry;
		regA = result & 0xff;

		status = ~(accumulator ^ value) & (accumulator ^ result) & 0x80 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;
		status = result > 0xff ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
		status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
		status = result & 0xff & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
		regP = status & 0xff;
	}
}

function sbc(value: number) {
	const accumulator = regA;
	let status = regP;
	const borrow = status & FLAG_C_MASK ? 0 : 1;

	const binaryDiff = accumulator - value - borrow;
	const carry = binaryDiff >= 0 ? 1 : 0;

	const overflow = (accumulator ^ value) & 0x80 && (accumulator ^ binaryDiff) & 0x80;
	status = overflow ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

	let result = binaryDiff;

	if (status & FLAG_D_MASK) {
		const lowDiff = (accumulator & 0x0f) - (value & 0x0f) - borrow;
		if (lowDiff < 0) result -= 0x06;
		if (binaryDiff < 0) result -= 0x60;
	}
	result = result & 0xff;

	regA = result & 0xff;

	status = carry ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
	status = result === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
	status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
	regP = status & 0xff;
}

function and(value: number) {
	const accumulator = regA;
	const result = accumulator & value;
	regA = result & 0xff;
	setNZFlags(result);
}

function ora(value: number) {
	const accumulator = regA;
	const result = accumulator | value;
	regA = result & 0xff;
	setNZFlags(result);
}

function eor(value: number) {
	const accumulator = regA;
	const result = accumulator ^ value;
	regA = result & 0xff;
	setNZFlags(result);
}

function asl(value: number): number {
	let status = regP;
	status = value & 0x80 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
	const result = (value << 1) & 0xff;
	status = result === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
	status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
	regP = status & 0xff;
	return result;
}

function lsr(value: number): number {
	let status = regP;
	status = value & 0x01 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
	const result = (value >> 1) & 0xff;
	status = result === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
	status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
	regP = status & 0xff;
	return result;
}

/** One instruction (a single step, a test): its registers loaded from the shared view, written back after. */
export function executeInstruction(): number {
	if (!registersView) return 0;
	loadRegisters(registersView);
	try {
		return execute();
	} finally {
		storeRegisters(registersView);
		registersLive = false;
	}
}

/** One instruction, on the live registers (see `registersLive`): its cycles (0 if a breakpoint stopped it). */
function execute(): number {
	if (!bus) return 0;

	let pc = regPC;
	const startPC = pc;

	// Check for PC breakpoint before executing
	// Only halt if we are in "run" mode. If we are single-stepping, we want to execute the instruction.
	const resumingFrom = resumeFromBreakpointAt;
	resumeFromBreakpointAt = null;
	if (isRunning && breakpointMap[pc]! & BP_PC && pc !== resumingFrom) {
		const bank = bus.getBank?.(pc) ?? 0;
		const physicalPC = (bank << 16) | pc;

		// Potential hit, do detailed check
		if (bankedBreakpoints.get(physicalPC)! & BP_PC) {
			let type = "pc";
			// Check if this is our step-over target
			if (stepBPAddress !== null && physicalPC === stepBPAddress) {
				type = "step";
				cleanStepBP();
			}
			setRunning(
				false,
				type === "step" ? { reason: "step", address: physicalPC } : breakpointStop(type, physicalPC),
			);

			video?.tick();
			bus?.syncState?.();

			self.postMessage({ type: "breakpointHit", breakpointType: type, address: physicalPC });
			return 0;
		}
	}

	// Executed from here on (a breakpoint above stops before it): record it with the registers before it.
	if (instructionTraceOn) recordInstruction(((bus.getBank?.(pc) ?? 0) << 16) | pc, regA, regX, regY, regP, regSP);

	// What stops the machine during this instruction (an error, a BRK / hypercall stop) also holds off an
	// interrupt: the PC stays where the stop left it.
	const runningBefore = isRunning;
	const stepStopBefore = stepStop;

	const opcode = bus.read(pc, true); // Opcode fetch (SYNC)
	pc++;

	let cycles = 2; // Default cycles, will be overridden

	// This is the core of the emulator. For performance, logic is kept inline
	// inside the switch cases, avoiding function calls where possible.
	try {
		switch (opcode) {
			// --- BRK ---
			case 0x00: {
				// BRK. `pc` is on its signature byte, which is the hypercall command.
				stoppedOnBrkAt = null;

				// Hypercall: run it here (decode, PC past it) and let the main thread apply its effect.
				// The call is read as the CPU sees memory now (`peek`: ALTZP, RAMRD, 80STORE…, so a call in the
				// aux language card decodes), without side effects (no soft switch triggered by a read).
				// `readDebug` with a 16-bit address would read the main bank.
				if (hypercallsEnabled) {
					const b = bus;
					const peek = (address: number) =>
						(b.peek ? b.peek(address) : b.readDebug ? b.readDebug(address) : b.read(address)) & 0xff;
					// Its arguments can be registers: read from the view
					if (registersView) storeRegisters(registersView);
					const call = decodeHypercall(peek, pc - 1, registersView ?? undefined);
					if (call) {
						const bank = bus.getBank?.(call.address) ?? 0;
						self.postMessage({ type: "hypercall", call });
						pc = (call.address + call.length) & 0xffff;
						cycles = 7;
						// Stop bit: stop after the call (PC on the next instruction). When stepping, the CPU is
						// already stopped. Posted after the call, so its effect (a log line) comes first.
						if (call.stop) {
							const stop = {
								reason: "hypercall",
								address: (bank << 16) | call.address,
								cmd: call.cmd,
							} as const;
							regPC = pc; // the stop posts the registers
							if (isRunning) setRunning(false, stop);
							else stepStop = stop; // stepping: ends a multi-instruction step here
						}
						break;
					}
				}

				// "break on BRK" only stops a running CPU, so stepping a BRK executes it.
				if (breakOnBrk && isRunning) {
					pc--; // Point back to the BRK instruction so the user sees it
					const bank = bus.getBank?.(pc) ?? 0;
					const address = (bank << 16) | pc;
					stoppedOnBrkAt = pc;
					setRunning(false, { reason: "brk", address });
					self.postMessage({ type: "break", address, wasRunning: true });
					cycles = 0;
					break;
				}

				{
					let s = regSP;

					// Push PC + 1
					pc++;
					const hi = pc >> 8;
					const lo = pc & 0x00ff;
					bus.write(STACK_PAGE_HI | s, hi);
					s = (s - 1) & 0xff;
					bus.write(STACK_PAGE_HI | s, lo);
					s = (s - 1) & 0xff;

					// Push P with B set: that's how an IRQ handler tells a BRK from an IRQ
					// (B isn't always set in the register, e.g. after reset).
					const status = regP | FLAG_5_MASK | FLAG_B_MASK;
					bus.write(STACK_PAGE_HI | s, status);
					s = (s - 1) & 0xff;

					regSP = s & 0xff;
				}

				// reset D flag and set I flag
				let status = regP;
				status = status & ~FLAG_D_MASK;
				// status |= FLAG_B_MASK;
				status |= FLAG_I_MASK;
				regP = status & 0xff;

				const lo = bus.read(0xfffe);
				const hi = bus.read(0xffff);
				pc = (hi << 8) | lo;

				cycles = 7;
				break;
			}
			case 0x04: {
				// TSB Zero Page (65C02)
				const addr = bus.read(pc, true);
				pc++;
				const memValue = bus.read(addr);
				const accumulator = regA;
				let status = regP;
				status = (memValue & accumulator) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				bus.write(addr, memValue | accumulator);
				regP = status & 0xff;
				cycles = 5;
				break;
			}
			case 0x08: {
				// PHP (Push Processor Status)
				let s = regSP;
				// On 65C02, Bit 5 is always 1.
				const status = regP | FLAG_5_MASK;
				bus.write(STACK_PAGE_HI | s, status);
				s = (s - 1) & 0xff;
				regSP = s & 0xff;
				cycles = 3;
				break;
			}
			// --- Logical Operations ---
			case 0x01: {
				// ORA (Indirect,X)
				const pointer = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				ora(bus.read(addr));
				cycles = 6;
				break;
			}
			case 0x05: {
				// ORA Zero Page
				const addr = bus.read(pc, true);
				pc++;
				ora(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0x06: {
				// ASL Zero Page
				const addr = bus.read(pc, true);
				pc++;
				let value = bus.read(addr);
				value = asl(value);
				bus.write(addr, value);
				cycles = 5;
				break;
			}
			case 0x09: {
				// ORA Immediate
				const value = bus.read(pc, true);
				pc++;
				ora(value);
				cycles = 2;
				break;
			}

			case 0x0a: {
				// ASL Accumulator
				let value = regA;
				value = asl(value);
				regA = value & 0xff;
				cycles = 2;
				break;
			}
			case 0x0c: {
				// TSB Absolute (65C02)
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const memValue = bus.read(addr);
				const accumulator = regA;
				let status = regP;
				status = (memValue & accumulator) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				bus.write(addr, memValue | accumulator);
				regP = status & 0xff;
				cycles = 6;
				break;
			}

			case 0x0d: {
				// ORA Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				ora(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x0e: {
				// ASL Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				let value = bus.read(addr);
				value = asl(value);
				bus.write(addr, value);
				cycles = 6;
				break;
			}

			case 0x11: {
				// ORA (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + regY;
				ora(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x12: {
				// ORA (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				ora(bus.read(addr));
				cycles = 5;
				break;
			}
			case 0x14: {
				// TRB Zero Page (65C02)
				const addr = bus.read(pc, true);
				pc++;
				const memValue = bus.read(addr);
				const accumulator = regA;
				let status = regP;
				status = (memValue & accumulator) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				bus.write(addr, memValue & ~accumulator);
				regP = status & 0xff;
				cycles = 5;
				break;
			}
			case 0x15: {
				// ORA Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				ora(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x16: {
				// ASL Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				let value = bus.read(addr);
				value = asl(value);
				bus.write(addr, value);
				cycles = 6;
				break;
			}
			case 0x19: {
				// ORA Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regY;
				ora(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x1c: {
				// TRB Absolute (65C02)
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const memValue = bus.read(addr);
				const accumulator = regA;
				let status = regP;
				status = (memValue & accumulator) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				bus.write(addr, memValue & ~accumulator);
				regP = status & 0xff;
				cycles = 6;
				break;
			}
			case 0x1d: {
				// ORA Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				ora(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x1e: {
				// ASL Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				let value = bus.read(addr);
				value = asl(value);
				bus.write(addr, value);
				cycles = 7;
				break;
			}

			case 0x28: {
				// PLP (Pull Processor Status)
				let s = regSP;
				s = (s + 1) & 0xff;
				const pulledStatus = bus.read(STACK_PAGE_HI | s);
				regP = (pulledStatus | FLAG_B_MASK) & 0xff;
				regSP = s & 0xff;
				cycles = 4;
				break;
			}
			case 0x21: {
				// AND (Indirect,X)
				const pointer = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				and(bus.read(addr));
				cycles = 6;
				break;
			}
			// --- Load/Store Operations ---
			case 0xa9: {
				// LDA #Immediate
				const value = bus.read(pc, true);
				pc++;
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xa2: {
				// LDX #Immediate
				const value = bus.read(pc, true);
				pc++;
				regX = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xa0: {
				// LDY #Immediate
				const value = bus.read(pc, true);
				pc++;
				regY = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xa6: {
				// LDX Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				regX = value & 0xff;
				setNZFlags(value);
				cycles = 3;
				break;
			}
			case 0xa4: {
				// LDY Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				regY = value & 0xff;
				setNZFlags(value);
				cycles = 3;
				break;
			}
			case 0xad: {
				// LDA Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xbd: {
				// LDA Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				const value = bus.read(addr);
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xb9: {
				// LDA Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regY;
				const value = bus.read(addr);
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xa5: {
				// LDA Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 3;
				break;
			}
			case 0xb5: {
				// LDA Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + regX) & 0xff;
				const value = bus.read(addr);
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xa1: {
				// LDA (Indirect,X)
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const pointer = (zeroPageAddr + regX) & 0xff;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				const value = bus.read(addr);
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 6;
				break;
			}
			case 0xb1: {
				// LDA (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + regY;
				const value = bus.read(addr);
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xb2: {
				// LDA (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const value = bus.read(addr);

				regA = value & 0xff;
				setNZFlags(value);
				cycles = 5;
				break;
			}
			case 0xae: {
				// LDX Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				regX = value & 0xff;
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xac: {
				// LDY Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				regY = value & 0xff;
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xbe: {
				// LDX Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regY;
				const value = bus.read(addr);
				regX = value & 0xff;
				setNZFlags(value);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xbc: {
				// LDY Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				const value = bus.read(addr);
				regY = value & 0xff;
				setNZFlags(value);
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xb6: {
				// LDX Zero Page,Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + regY) & 0xff;
				const value = bus.read(addr);
				regX = value & 0xff;
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0xb4: {
				// LDY Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + regX) & 0xff;
				const value = bus.read(addr);
				regY = value & 0xff;
				setNZFlags(value);
				cycles = 4;
				break;
			}

			case 0x8d: {
				// STA Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				bus.write(addr, regA);
				cycles = 4;
				break;
			}
			case 0x86: {
				// STX Zero Page
				const addr = bus.read(pc, true);
				pc++;
				bus.write(addr, regX);
				cycles = 3;
				break;
			}
			case 0x84: {
				// STY Zero Page
				const addr = bus.read(pc, true);
				pc++;
				bus.write(addr, regY);
				cycles = 3;
				break;
			}
			case 0x8e: {
				// STX Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				bus.write(addr, regX);
				cycles = 4;
				break;
			}
			case 0x8c: {
				// STY Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				bus.write(addr, regY);
				cycles = 4;
				break;
			}
			case 0x96: {
				// STX Zero Page,Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + regY) & 0xff;
				bus.write(addr, regX);
				cycles = 4;
				break;
			}
			case 0x94: {
				// STY Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + regX) & 0xff;
				bus.write(addr, regY);
				cycles = 4;
				break;
			}
			case 0x25: {
				// AND Zero Page
				const addr = bus.read(pc, true);
				pc++;
				and(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0x29: {
				// AND Immediate
				const value = bus.read(pc, true);
				pc++;
				and(value);
				cycles = 2;
				break;
			}
			case 0x2d: {
				// AND Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				and(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x31: {
				// AND (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + regY;
				and(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x32: {
				// AND (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				and(bus.read(addr));
				cycles = 5;
				break;
			}
			case 0x35: {
				// AND Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				and(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x39: {
				// AND Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regY;
				and(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x3d: {
				// AND Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				and(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x40: {
				// RTI (Return from Interrupt)
				const shouldStop = stepOutTargetSP !== null && regSP >= stepOutTargetSP;

				let s = regSP;
				bus.onRti?.(s); // before the pulls: an IMU restores the interrupted map, its stack included

				// PLP (Pull Processor Status)
				s = (s + 1) & 0xff;
				const pulledStatus = bus.read(STACK_PAGE_HI | s);
				regP = (pulledStatus | FLAG_B_MASK) & 0xff;

				// RTS
				s = (s + 1) & 0xff;
				const lo = bus.read(STACK_PAGE_HI | s);
				s = (s + 1) & 0xff;
				const hi = bus.read(STACK_PAGE_HI | s);
				pc = (hi << 8) | lo;

				regSP = s & 0xff;

				// pc--;

				cycles = 6;

				if (shouldStop) {
					stepOutTargetSP = null; // reached (a single step through it too)
					if (isRunning) {
						const bank = bus.getBank?.(pc) ?? 0;
						const physicalPC = (bank << 16) | pc;
						regPC = pc & 0xffff; // the stop posts the registers
						setRunning(false, { reason: "step", address: physicalPC });
						self.postMessage({ type: "breakpointHit", breakpointType: "step", address: physicalPC });
					}
				}
				break;
			}
			case 0x41: {
				// EOR (Indirect,X)
				const pointer = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				eor(bus.read(addr));
				cycles = 6;
				break;
			}
			case 0x45: {
				// EOR Zero Page
				const addr = bus.read(pc, true);
				pc++;
				eor(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0x49: {
				// EOR Immediate
				const value = bus.read(pc, true);
				pc++;
				eor(value);
				cycles = 2;
				break;
			}
			case 0x4d: {
				// EOR Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				eor(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x51: {
				// EOR (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + regY;
				eor(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x52: {
				// EOR (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				eor(bus.read(addr));
				cycles = 5;
				break;
			}
			case 0x55: {
				// EOR Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				eor(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x59: {
				// EOR Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regY;
				eor(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x5d: {
				// EOR Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				eor(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}

			case 0x4a: {
				// LSR Accumulator
				let value = regA;
				value = lsr(value);
				regA = value & 0xff;
				cycles = 2;
				break;
			}
			case 0x46: {
				// LSR Zero Page
				const addr = bus.read(pc, true);
				pc++;
				let value = bus.read(addr);
				value = lsr(value);
				bus.write(addr, value);
				cycles = 5;
				break;
			}
			case 0x56: {
				// LSR Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				let value = bus.read(addr);
				value = lsr(value);
				bus.write(addr, value);
				cycles = 6;
				break;
			}
			case 0x4e: {
				// LSR Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				let value = bus.read(addr);
				value = lsr(value);
				bus.write(addr, value);
				cycles = 6;
				break;
			}
			case 0x5e: {
				// LSR Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				let value = bus.read(addr);
				value = lsr(value);
				bus.write(addr, value);
				cycles = 7;
				break;
			}

			// --- Rotate Operations ---
			case 0x6a: {
				// ROR Accumulator
				let value = regA;
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 0x80 : 0;
				status = value & 0x01 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = (value >> 1) | oldCarry;
				regA = value & 0xff;
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 2;
				break;
			}
			case 0x66: {
				// ROR Zero Page
				const addr = bus.read(pc, true);
				pc++;
				let value = bus.read(addr);
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 0x80 : 0;
				status = value & 0x01 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = (value >> 1) | oldCarry;
				bus.write(addr, value);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 5;
				break;
			}
			case 0x76: {
				// ROR Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				let value = bus.read(addr);
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 0x80 : 0;
				status = value & 0x01 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = (value >> 1) | oldCarry;
				bus.write(addr, value);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 6;
				break;
			}
			case 0x6e: {
				// ROR Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				let value = bus.read(addr);
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 0x80 : 0;
				status = value & 0x01 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = (value >> 1) | oldCarry;
				bus.write(addr, value);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 6;
				break;
			}
			case 0x7e: {
				// ROR Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				let value = bus.read(addr);
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 0x80 : 0;
				status = value & 0x01 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = (value >> 1) | oldCarry;
				bus.write(addr, value);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 7;
				break;
			}

			case 0x2a: {
				// ROL Accumulator
				let value = regA;
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 1 : 0;
				status = value & 0x80 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = ((value << 1) | oldCarry) & 0xff;
				regA = value & 0xff;
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 2;
				break;
			}
			case 0x26: {
				// ROL Zero Page
				const addr = bus.read(pc, true);
				pc++;
				let value = bus.read(addr);
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 1 : 0;
				status = value & 0x80 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = ((value << 1) | oldCarry) & 0xff;
				bus.write(addr, value);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 5;
				break;
			}
			case 0x36: {
				// ROL Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				let value = bus.read(addr);
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 1 : 0;
				status = value & 0x80 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = ((value << 1) | oldCarry) & 0xff;
				bus.write(addr, value);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 6;
				break;
			}
			case 0x2e: {
				// ROL Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				let value = bus.read(addr);
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 1 : 0;
				status = value & 0x80 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = ((value << 1) | oldCarry) & 0xff;
				bus.write(addr, value);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 6;
				break;
			}
			case 0x3e: {
				// ROL Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				let value = bus.read(addr);
				let status = regP;
				const oldCarry = status & FLAG_C_MASK ? 1 : 0;
				status = value & 0x80 ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				value = ((value << 1) | oldCarry) & 0xff;
				bus.write(addr, value);
				status = value === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 7;
				break;
			}

			// --- Arithmetic Operations ---
			case 0x69: {
				// ADC #Immediate
				const value = bus.read(pc, true);
				pc++;
				adc(value);
				cycles = 2;
				break;
			}
			case 0x65: {
				// ADC Zero Page
				const addr = bus.read(pc, true);
				pc++;
				adc(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0x75: {
				// ADC Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				adc(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x6d: {
				// ADC Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				adc(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0x7d: {
				// ADC Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				adc(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x79: {
				// ADC Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regY;
				adc(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x61: {
				// ADC (Indirect,X)
				const pointer = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				adc(bus.read(addr));
				cycles = 6;
				break;
			}
			case 0x71: {
				// ADC (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + regY;
				adc(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x72: {
				// ADC (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				adc(bus.read(addr));
				cycles = 5;
				break;
			}

			case 0xe9: {
				// SBC #Immediate
				const value = bus.read(pc, true);
				pc++;
				sbc(value);
				cycles = 2;
				break;
			}
			case 0xe5: {
				// SBC Zero Page
				const addr = bus.read(pc, true);
				pc++;
				sbc(bus.read(addr));
				cycles = 3;
				break;
			}
			case 0xf5: {
				// SBC Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				sbc(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0xed: {
				// SBC Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				sbc(bus.read(addr));
				cycles = 4;
				break;
			}
			case 0xfd: {
				// SBC Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				sbc(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xf9: {
				// SBC Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regY;
				sbc(bus.read(addr));
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xe1: {
				// SBC (Indirect,X)
				const pointer = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				sbc(bus.read(addr));
				cycles = 6;
				break;
			}
			case 0xf1: {
				// SBC (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + regY;
				sbc(bus.read(addr));
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xf2: {
				// SBC (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				sbc(bus.read(addr));
				cycles = 5;
				break;
			}

			case 0xc9: {
				// CMP #Immediate
				const value = bus.read(pc, true);
				pc++;
				const accumulator = regA;
				const result = accumulator - value;

				let status = regP;

				// Set flags based on comparison
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				regP = status & 0xff;
				cycles = 2;
				break;
			}

			case 0xc0: {
				// CPY #Immediate
				const value = bus.read(pc, true);
				pc++;
				const yRegister = regY;
				const result = yRegister - value;

				let status = regP;

				// Set flags based on comparison
				status = yRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				regP = status & 0xff;
				cycles = 2;
				break;
			}

			case 0xcc: {
				// CPY Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const yRegister = regY;
				const result = yRegister - value;

				let status = regP;

				// Set flags based on comparison
				status = yRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				regP = status & 0xff;
				cycles = 4;
				break;
			}

			case 0x9d: {
				// STA Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				bus.write(addr, regA);
				cycles = 5;
				break;
			}
			case 0x99: {
				// STA Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regY;
				bus.write(addr, regA);
				cycles = 5;
				break;
			}
			case 0x85: {
				// STA Zero Page
				const addr = bus.read(pc, true);
				pc++;
				bus.write(addr, regA);
				cycles = 3;
				break;
			}
			case 0x95: {
				// STA Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + regX) & 0xff;
				bus.write(addr, regA);
				cycles = 4;
				break;
			}
			case 0x81: {
				// STA (Indirect,X)
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const pointer = (zeroPageAddr + regX) & 0xff;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				bus.write(addr, regA);
				cycles = 6;
				break;
			}
			case 0x91: {
				// STA (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + regY;
				bus.write(addr, regA);
				cycles = 6;
				break;
			}
			case 0x92: {
				// STA (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				bus.write(addr, regA);
				cycles = 5;
				break;
			}

			// --- STZ (65C02) ---
			case 0x64: {
				// STZ Zero Page
				const addr = bus.read(pc, true);
				pc++;
				bus.write(addr, 0);
				cycles = 3;
				break;
			}
			case 0x74: {
				// STZ Zero Page,X
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = (zeroPageAddr + regX) & 0xff;
				bus.write(addr, 0);
				cycles = 4;
				break;
			}
			case 0x9c: {
				// STZ Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				bus.write(addr, 0);
				cycles = 4;
				break;
			}
			case 0x9e: {
				// STZ Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				bus.write(addr, 0);
				cycles = 5;
				break;
			}

			// --- Register Transfers ---
			case 0xaa: {
				// TAX
				const value = regA;
				regX = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xa8: {
				// TAY
				const value = regA;
				regY = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x8a: {
				// TXA
				const value = regX;
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x98: {
				// TYA
				const value = regY;
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}

			// --- Stack Operations ---
			case 0x9a: {
				// TXS
				regSP = regX & 0xff;
				cycles = 2;
				break;
			}
			case 0xba: {
				// TSX
				const value = regSP;
				regX = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x48: {
				// PHA
				let s = regSP;
				bus.write(STACK_PAGE_HI | s, regA);
				s = (s - 1) & 0xff;
				regSP = s & 0xff;
				cycles = 3;
				break;
			}
			case 0x68: {
				// PLA
				let s = regSP;
				s = (s + 1) & 0xff;
				const value = bus.read(STACK_PAGE_HI | s);
				regA = value & 0xff;
				regSP = s & 0xff;
				setNZFlags(value);
				cycles = 4;
				break;
			}
			// --- 65C02 Stack Operations ---
			case 0xda: {
				// PHX
				let s = regSP;
				bus.write(STACK_PAGE_HI | s, regX);
				s = (s - 1) & 0xff;
				regSP = s & 0xff;
				cycles = 3;
				break;
			}
			case 0xfa: {
				// PLX
				let s = regSP;
				s = (s + 1) & 0xff;
				const value = bus.read(STACK_PAGE_HI | s);
				regX = value & 0xff;
				regSP = s & 0xff;
				setNZFlags(value);
				cycles = 4;
				break;
			}
			case 0x5a: {
				// PHY
				let s = regSP;
				bus.write(STACK_PAGE_HI | s, regY);
				s = (s - 1) & 0xff;
				regSP = s & 0xff;
				cycles = 3;
				break;
			}
			case 0x7a: {
				// PLY
				let s = regSP;
				s = (s + 1) & 0xff;
				const value = bus.read(STACK_PAGE_HI | s);
				regY = value & 0xff;
				regSP = s & 0xff;
				setNZFlags(value);
				cycles = 4;
				break;
			}

			// --- Increments & Decrements ---
			case 0x3a: {
				// DEC A (65C02)
				let value = regA;
				value = (value - 1) & 0xff;
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x1a: {
				// INC A (65C02)
				let value = regA;
				value = (value + 1) & 0xff;
				regA = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}

			case 0xca: {
				// DEX
				let value = regX;
				value = (value - 1) & 0xff;
				regX = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xe8: {
				// INX
				let value = regX;
				value = (value + 1) & 0xff;
				regX = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0x88: {
				// DEY
				let value = regY;
				value = (value - 1) & 0xff;
				regY = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}
			case 0xc8: {
				// INY
				let value = regY;
				value = (value + 1) & 0xff;
				regY = value & 0xff;
				setNZFlags(value);
				cycles = 2;
				break;
			}

			case 0xc6: {
				// DEC Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const result = (value - 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 5;
				break;
			}
			case 0xd6: {
				// DEC Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const value = bus.read(addr);
				const result = (value - 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 6;
				break;
			}
			case 0xce: {
				// DEC Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const result = (value - 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 6;
				break;
			}
			case 0xde: {
				// DEC Absolute,X
				const addr = (bus.read(pc, true) | (bus.read(pc + 1, true) << 8)) + regX;
				pc += 2;
				const value = bus.read(addr);
				const result = (value - 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 7;
				break;
			}

			case 0xe6: {
				// INC Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const result = (value + 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 5;
				break;
			}
			case 0xf6: {
				// INC Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const value = bus.read(addr);
				const result = (value + 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 6;
				break;
			}
			case 0xee: {
				// INC Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const result = (value + 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 6;
				break;
			}
			case 0xfe: {
				// INC Absolute,X
				const addr = (bus.read(pc, true) | (bus.read(pc + 1, true) << 8)) + regX;
				pc += 2;
				const value = bus.read(addr);
				const result = (value + 1) & 0xff;
				bus.write(addr, result);
				setNZFlags(result);
				cycles = 7;
				break;
			}

			// --- Jumps & Calls ---
			case 0x4c: {
				// JMP Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				logTrace("JMP", startPC, addr);
				pc = addr;
				cycles = 3;
				break;
			}
			case 0x6c: {
				// JMP Indirect (6502 bug fixed in 65C02)
				const pointer = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				const addr = bus.read(pointer) | (bus.read(pointer + 1) << 8);
				logTrace("JMP", startPC, addr);
				pc = addr;
				cycles = 6; // 65C02 is 6 cycles, 6502 is 5
				break;
			}
			case 0x7c: {
				// JMP (Absolute,X) (65C02)
				const basePointer = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				const pointer = basePointer + regX;
				const addr = bus.read(pointer) | (bus.read(pointer + 1) << 8);
				logTrace("JMP", startPC, addr);
				pc = addr;
				cycles = 6;
				break;
			}
			case 0x20: {
				// JSR Absolute
				const targetAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const returnAddr = pc - 1;
				let s = regSP;

				// The address we store in metadata is targetAddr + 1 to avoid storing 0 for JSR $0000
				const metaAddr = targetAddr + 1;
				const metaHi = (metaAddr >> 8) & 0xff;
				const metaLo = metaAddr & 0xff;

				bus.write(STACK_PAGE_HI | s, (returnAddr >> 8) & 0xff);
				stackMetadataView[s] = metaHi;
				s = (s - 1) & 0xff;
				bus.write(STACK_PAGE_HI | s, returnAddr & 0xff);
				stackMetadataView[s] = metaLo;
				s = (s - 1) & 0xff;
				regSP = s & 0xff;
				logTrace("JSR", startPC, targetAddr);
				pc = targetAddr;
				cycles = 6;
				break;
			}
			case 0x60: {
				// RTS
				const shouldStop = stepOutTargetSP !== null && regSP >= stepOutTargetSP;

				let s = regSP;
				s = (s + 1) & 0xff;
				const lo = bus.read(STACK_PAGE_HI | s);
				stackMetadataView[s] = 0;
				s = (s + 1) & 0xff;
				const hi = bus.read(STACK_PAGE_HI | s);
				stackMetadataView[s] = 0;
				regSP = s & 0xff;
				pc = ((hi << 8) | lo) + 1;
				cycles = 6;

				if (shouldStop) {
					stepOutTargetSP = null; // reached (a single step through it too)
					if (isRunning) {
						const bank = bus.getBank?.(pc) ?? 0;
						const physicalPC = (bank << 16) | pc;
						regPC = pc & 0xffff; // the stop posts the registers
						setRunning(false, { reason: "step", address: physicalPC });
						self.postMessage({ type: "breakpointHit", breakpointType: "step", address: physicalPC });
					}
				}
				break;
			}

			// --- Branching ---
			case 0x80: // BRA (65C02)
			case 0x90: // BCC
			case 0xb0: // BCS
			case 0xf0: // BEQ
			case 0xd0: // BNE
			case 0x30: // BMI
			case 0x10: // BPL
			case 0x50: // BVC
			case 0x70: {
				// BVS
				const offset = bus.read(pc, true);
				pc++;
				const status = regP;
				let branch = false;
				switch (opcode) {
					case 0x80:
						branch = true;
						break; // BRA
					case 0x90:
						branch = !(status & FLAG_C_MASK);
						break; // BCC
					case 0xb0:
						branch = !!(status & FLAG_C_MASK);
						break; // BCS
					case 0xf0:
						branch = !!(status & FLAG_Z_MASK);
						break; // BEQ
					case 0xd0:
						branch = !(status & FLAG_Z_MASK);
						break; // BNE
					case 0x30:
						branch = !!(status & FLAG_N_MASK);
						break; // BMI
					case 0x10:
						branch = !(status & FLAG_N_MASK);
						break; // BPL
					case 0x50:
						branch = !(status & FLAG_V_MASK);
						break; // BVC
					case 0x70:
						branch = !!(status & FLAG_V_MASK);
						break; // BVS
				}

				if (branch) {
					cycles = 3; // Base for branch taken
					const branchAddr = pc + (offset < 0x80 ? offset : offset - 0x100);
					if ((pc & 0xff00) !== (branchAddr & 0xff00)) {
						cycles++; // Add cycle for page cross
					}
					pc = branchAddr;
				} else {
					cycles = 2; // Branch not taken
				}
				break;
			}

			// --- Status Flag Changes ---
			case 0x18: {
				// CLC
				regP = regP & ~FLAG_C_MASK & 0xff;
				cycles = 2;
				break;
			}
			case 0x38: {
				// SEC
				regP = (regP | FLAG_C_MASK) & 0xff;
				cycles = 2;
				break;
			}
			case 0x58: {
				// CLI
				regP = regP & ~FLAG_I_MASK & 0xff;
				cycles = 2;
				break;
			}
			case 0x78: {
				// SEI
				regP = (regP | FLAG_I_MASK) & 0xff;
				cycles = 2;
				break;
			}
			case 0xb8: {
				// CLV
				regP = regP & ~FLAG_V_MASK & 0xff;
				cycles = 2;
				break;
			}
			case 0xd8: {
				// CLD
				regP = regP & ~FLAG_D_MASK & 0xff;
				cycles = 2;
				break;
			}
			case 0xf8: {
				// SED
				regP = (regP | FLAG_D_MASK) & 0xff;
				cycles = 2;
				break;
			}

			case 0x24: {
				// BIT Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const accumulator = regA;
				let status = regP;

				// Z flag is set if A & M is 0
				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				// N and V flags are set from bits 7 and 6 of the memory value
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				status = value & 0x40 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

				regP = status & 0xff;
				cycles = 3;
				break;
			}
			case 0x2c: {
				// BIT Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const accumulator = regA;
				let status = regP;

				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				status = value & 0x40 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

				regP = status & 0xff;
				cycles = 4;
				break;
			}
			case 0x34: {
				// BIT Zero Page,X (65C02)
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const value = bus.read(addr);
				const accumulator = regA;
				let status = regP;

				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				status = value & 0x40 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

				regP = status & 0xff;
				cycles = 4;
				break;
			}
			case 0x3c: {
				// BIT Absolute,X (65C02)
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				const value = bus.read(addr);
				const accumulator = regA;
				let status = regP;

				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = value & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				status = value & 0x40 ? status | FLAG_V_MASK : status & ~FLAG_V_MASK;

				regP = status & 0xff;
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0x89: {
				// BIT Immediate (65C02)
				const value = bus.read(pc, true);
				pc++;
				const accumulator = regA;
				let status = regP;

				// Only affects Z flag
				status = (accumulator & value) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;

				regP = status & 0xff;
				cycles = 2;
				break;
			}

			case 0xc1: {
				// CMP (Indirect,X)
				const pointer = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const addr = bus.read(pointer) | (bus.read((pointer + 1) & 0xff) << 8);
				const value = bus.read(addr);
				const accumulator = regA;
				const result = accumulator - value;
				let status = regP;
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 6;
				break;
			}
			case 0xc4: {
				// CPY Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const yRegister = regY;
				const result = yRegister - value;
				let status = regP;
				status = yRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 3;
				break;
			}
			case 0xc5: {
				// CMP Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const accumulator = regA;
				const result = accumulator - value;
				let status = regP;
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 3;
				break;
			}
			case 0xcd: {
				// CMP Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const accumulator = regA;
				const result = accumulator - value;
				let status = regP;
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 4;
				break;
			}
			case 0xd1: {
				// CMP (Indirect),Y
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const baseAddr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const addr = baseAddr + regY;
				const value = bus.read(addr);
				const accumulator = regA;
				const result = accumulator - value;
				let status = regP;
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 5 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xd2: {
				// CMP (Zero Page Indirect) - 65C02
				const zeroPageAddr = bus.read(pc, true);
				pc++;
				const addr = bus.read(zeroPageAddr) | (bus.read((zeroPageAddr + 1) & 0xff) << 8);
				const value = bus.read(addr);
				const accumulator = regA;
				const result = accumulator - value;
				let status = regP;
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 5;
				break;
			}
			case 0xd5: {
				// CMP Zero Page,X
				const addr = (bus.read(pc, true) + regX) & 0xff;
				pc++;
				const value = bus.read(addr);
				const accumulator = regA;
				const result = accumulator - value;
				let status = regP;
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 4;
				break;
			}
			case 0xd9: {
				// CMP Absolute,Y
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regY;
				const value = bus.read(addr);
				const accumulator = regA;
				const result = accumulator - value;
				let status = regP;
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}
			case 0xdd: {
				// CMP Absolute,X
				const baseAddr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const addr = baseAddr + regX;
				const value = bus.read(addr);
				const accumulator = regA;
				const result = accumulator - value;
				let status = regP;
				status = accumulator >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 4 + ((baseAddr & 0xff00) !== (addr & 0xff00) ? 1 : 0);
				break;
			}

			case 0xe0: {
				// CPX #Immediate
				const value = bus.read(pc, true);
				pc++;
				const xRegister = regX;
				const result = xRegister - value;

				let status = regP;

				// Set flags based on comparison
				status = xRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				regP = status & 0xff;
				cycles = 2;
				break;
			}

			case 0xe4: {
				// CPX Zero Page
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				const xRegister = regX;
				const result = xRegister - value;
				let status = regP;
				status = xRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;
				regP = status & 0xff;
				cycles = 3;
				break;
			}

			case 0xec: {
				// CPX Absolute
				const addr = bus.read(pc, true) | (bus.read(pc + 1, true) << 8);
				pc += 2;
				const value = bus.read(addr);
				const xRegister = regX;
				const result = xRegister - value;

				let status = regP;

				// Set flags based on comparison
				status = xRegister >= value ? status | FLAG_C_MASK : status & ~FLAG_C_MASK;
				status = (result & 0xff) === 0 ? status | FLAG_Z_MASK : status & ~FLAG_Z_MASK;
				status = result & 0x80 ? status | FLAG_N_MASK : status & ~FLAG_N_MASK;

				regP = status & 0xff;
				cycles = 4;
				break;
			}

			// --- No Operation ---
			case 0xea: {
				// NOP
				// Official NOP
				cycles = 2;
				break;
			}

			// --- RMB (Reset Memory Bit) - 65C02 ---
			case 0x07:
			case 0x17:
			case 0x27:
			case 0x37:
			case 0x47:
			case 0x57:
			case 0x67:
			case 0x77: {
				const bit = (opcode >> 4) & 0x07;
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				bus.write(addr, value & ~(1 << bit));
				cycles = 5;
				break;
			}

			// --- SMB (Set Memory Bit) - 65C02 ---
			case 0x87:
			case 0x97:
			case 0xa7:
			case 0xb7:
			case 0xc7:
			case 0xd7:
			case 0xe7:
			case 0xf7: {
				const bit = (opcode >> 4) & 0x07;
				const addr = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);
				bus.write(addr, value | (1 << bit));
				cycles = 5;
				break;
			}

			// --- BBR/BBS (65C02) ---
			case 0x0f: // BBR0
			case 0x1f: // BBR1
			case 0x2f: // BBR2
			case 0x3f: // BBR3
			case 0x4f: // BBR4
			case 0x5f: // BBR5
			case 0x6f: // BBR6
			case 0x7f: {
				// BBR
				const bit = (opcode & 0x70) >> 4;
				const addr = bus.read(pc, true);
				pc++;
				const offset = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);

				if ((value & (1 << bit)) === 0) {
					// Branch taken
					const branchAddr = pc + (offset < 0x80 ? offset : offset - 0x100);
					// BBR/BBS do not have an extra cycle for page crossing
					pc = branchAddr;
					cycles = 7;
				} else {
					// Branch not taken
					cycles = 5;
				}
				break;
			}
			case 0x8f: // BBS0
			case 0x9f: // BBS1
			case 0xaf: // BBS2
			case 0xbf: // BBS3
			case 0xcf: // BBS4
			case 0xdf: // BBS5
			case 0xef: // BBS6
			case 0xff: {
				// BBS
				const bit = (opcode & 0x70) >> 4;
				const addr = bus.read(pc, true);
				pc++;
				const offset = bus.read(pc, true);
				pc++;
				const value = bus.read(addr);

				if ((value & (1 << bit)) !== 0) {
					// Branch taken
					const branchAddr = pc + (offset < 0x80 ? offset : offset - 0x100);
					// BBR/BBS do not have an extra cycle for page crossing
					pc = branchAddr;
					cycles = 7;
				} else {
					// Branch not taken
					cycles = 5;
				}
				break;
			}

			// --- Undocumented NOPs (65C02) ---
			// These opcodes are defined as NOPs of varying lengths and cycle counts on the 65C02.

			// 1-byte NOPs
			case 0x03:
			case 0x13:
			case 0x23:
			case 0x33:
			case 0x43:
			case 0x53:
			case 0x63:
			case 0x73:
			case 0x83:
			case 0x93:
			case 0xa3:
			case 0xb3:
			case 0xc3:
			case 0xd3:
			case 0xe3:
			case 0xf3:
			case 0x0b:
			case 0x1b:
			case 0x2b:
			case 0x3b:
			case 0x4b:
			case 0x5b:
			case 0x6b:
			case 0x7b:
			case 0x8b:
			case 0x9b:
			case 0xab:
			case 0xbb:
			case 0xcb: // WAI on WDC, NOP on Rockwell
			case 0xdb: // STP on WDC, NOP on Rockwell
			case 0xeb:
			case 0xfb: {
				cycles = 1;
				break;
			}

			// 2-byte NOPs
			case 0x02:
			case 0x22:
			case 0x42:
			case 0x62:
			case 0x82:
			case 0xc2:
			case 0xe2: {
				pc++;
				cycles = 2;
				break;
			}

			// 2-byte, 3-cycle NOPs
			case 0x44: {
				pc++;
				cycles = 3;
				break;
			}

			// 2-byte, 4-cycle NOPs
			case 0xd4:
			case 0xf4:
			case 0x54: {
				pc++;
				cycles = 4;
				break;
			}

			// 3-byte, 8-cycle NOPs
			case 0x5c: {
				pc += 2;
				cycles = 8;
				break;
			}

			// 3-byte, 4-cycle NOPs
			case 0xdc:
			case 0xfc: {
				pc += 2;
				cycles = 4;
				break;
			}

			default: {
				const errorAddress = pc - 1;
				const errorMessage = `Unimplemented opcode ${opcode.toString(16).toUpperCase()} at address $${errorAddress.toString(16).toUpperCase()}`;
				console.error(`Emulator: ${errorMessage}`);

				// Notify the main thread about the error
				self.postMessage({
					type: "error",
					error: "unimplemented_opcode",
					message: errorMessage,
					address: errorAddress,
					opcode: opcode,
				});

				regPC = pc & 0xffff; // the stop posts the registers
				setRunning(false, { reason: "error", address: errorAddress, message: errorMessage }); // Stop on unimplemented opcode
				break;
			}
		}
	} catch (error) {
		if (error instanceof BreakpointError) {
			setRunning(false, breakpointStop(error.type, error.address));
			pc = startPC;
			stoppedOnAccessAt = startPC;
			self.postMessage({
				type: "breakpointHit",
				breakpointType: error.type,
				address: error.address,
			});
			return 0;
		}
		throw error;
	} finally {
		regPC = pc & 0xffff;
	}

	if (
		(nmiPending || (irqLine && !(regP & FLAG_I_MASK))) &&
		isRunning === runningBefore &&
		stepStop === stepStopBefore
	)
		cycles += serviceInterrupt();

	return cycles;
}

/**
 * The interrupt sequence (NMI first, else IRQ): pushes PC and P (B clear, which tells it from a BRK), sets I,
 * clears D (65C02), and jumps through $FFFA (NMI) or $FFFE (IRQ), unless the bus vectors the IRQ (IMU). 7 cycles.
 */
function serviceInterrupt(): number {
	if (!bus) return 0;
	const nmi = nmiPending;
	nmiPending = false;

	const from = regPC;
	let s = regSP;
	bus.write(STACK_PAGE_HI | s, from >> 8);
	stackMetadataView[s] = 0;
	s = (s - 1) & 0xff;
	bus.write(STACK_PAGE_HI | s, from & 0xff);
	stackMetadataView[s] = 0;
	s = (s - 1) & 0xff;
	const status = regP;
	bus.write(STACK_PAGE_HI | s, (status | FLAG_5_MASK) & ~FLAG_B_MASK);
	s = (s - 1) & 0xff;
	regSP = s & 0xff;
	regP = (status | FLAG_I_MASK) & ~FLAG_D_MASK & 0xff;

	// A vectored IRQ (IMU): its handler, instead of $FFFE/F
	const vectored = nmi ? undefined : bus.irqVector?.(s);
	const vector = nmi ? 0xfffa : 0xfffe;
	const to = vectored ? vectored.address : bus.read(vector) | (bus.read(vector + 1) << 8);
	regPC = to & 0xffff;
	logTrace(nmi ? "NMI" : vectored ? `IRQ#${vectored.id}` : "IRQ", from, to);
	return 7;
}
