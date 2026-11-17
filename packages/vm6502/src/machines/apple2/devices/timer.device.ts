import type { AppleDevice, AppleDeviceContext } from "./device.interface";

/** One NTSC frame of the //e: 65 cycles × 262 lines. */
export const FRAME_CYCLES = 17_030;

// Ports (offsets from $C0B8)
/** R: bit 7 running, bit 0 fired (its line asserted). W: bit 7 starts (from a full period) or stops it. */
export const TIMER_PORT_CTRL = 0;
/** W: acknowledge, releases the line. Reads 0. */
export const TIMER_PORT_ACK = 1;
/** RW: the period in frames (1/60 s), 0 meaning 256. Takes effect at the next start or pulse. */
export const TIMER_PORT_PERIOD = 2;

export const TIMER_RUN = 0x80;
export const TIMER_FIRED = 0x01;
/** 60 frames: about a second. */
export const TIMER_DEFAULT_PERIOD = 60;

export type TimerSnapshot = { running: boolean; fired: boolean; period: number; remaining: number };

/**
 * A periodic interrupt source built into the //e (no card): every PERIOD frames it asserts its line until the
 * program acknowledges it. Stopped at reset, so it never interrupts a program that didn't start it. A device
 * (conf/devices.conf.ts): on the //e it drives IMU ID 8, its registers at $C0B8-$C0BA.
 */
export class AppleTimer implements AppleDevice {
	private running = false;
	private fired = false;
	private period = TIMER_DEFAULT_PERIOD;
	/** Cycles until the next pulse. */
	private remaining = 0;

	private readonly setIrq: (active: boolean) => void;

	constructor({ setIrq }: Pick<AppleDeviceContext, "setIrq">) {
		this.setIrq = setIrq;
	}

	get irq() {
		return this.fired;
	}

	private get periodCycles() {
		return (this.period || 256) * FRAME_CYCLES;
	}

	reset() {
		this.running = false;
		this.period = TIMER_DEFAULT_PERIOD;
		this.remaining = 0;
		this.setFired(false);
	}

	tick(cycles: number) {
		if (!this.running) return;
		this.remaining -= cycles;
		if (this.remaining > 0) return;
		// Keeps its phase whatever the instruction lengths (and pulses only once if several periods went by)
		this.remaining = (this.remaining % this.periodCycles) + this.periodCycles;
		this.setFired(true);
	}

	read(offset: number): number {
		switch (offset) {
			case TIMER_PORT_CTRL:
				return (this.running ? TIMER_RUN : 0) | (this.fired ? TIMER_FIRED : 0);
			case TIMER_PORT_PERIOD:
				return this.period;
			default:
				return 0;
		}
	}

	write(offset: number, value: number) {
		switch (offset) {
			case TIMER_PORT_CTRL:
				this.running = (value & TIMER_RUN) !== 0;
				this.remaining = this.periodCycles;
				break;
			case TIMER_PORT_ACK:
				this.setFired(false);
				break;
			case TIMER_PORT_PERIOD:
				this.period = value & 0xff;
				break;
		}
	}

	private setFired(fired: boolean) {
		if (fired === this.fired) return;
		this.fired = fired;
		this.setIrq(fired);
	}

	snapshot(): TimerSnapshot {
		return { running: this.running, fired: this.fired, period: this.period, remaining: this.remaining };
	}

	restoreSnapshot(snapshot: unknown) {
		const state = snapshot as TimerSnapshot;
		this.running = state.running;
		this.period = state.period;
		this.remaining = state.remaining;
		this.setFired(state.fired);
	}
}
