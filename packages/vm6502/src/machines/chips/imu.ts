import type { IMUState, InterruptFrame } from "@/types/interrupts.interface";

/**
 * The machine's MMU, as the IMU sees it: switches to a handler's bank when its IRQ is taken, and back on the
 * matching RTI. Optional: without it, the banks (HBANK) are ignored.
 */
export interface InterruptContext {
	/** After the pushes, before the handler's first fetch: switch to `bank`. Returns the state to restore. */
	enter(bank: number): number;
	/** On the matching RTI, before the pulls: restore. */
	exit(saved: number): void;
}

export interface IMUOptions {
	/** Drives the CPU's IRQ line. */
	irq(active: boolean): void;
	context?: InterruptContext;
}

/** A vectored dispatch: `sp` the SP after the 3 pushes, `saved` what `context.enter` returned. */
export type IMUFrame = InterruptFrame;

/** The winner of a vectored IRQ: its ID, and the handler to jump to. */
export type IMUVector = { id: number; address: number };

/** What a save state keeps of the IMU. The lines (`asserted`) are not part of it: the devices drive them again. */
export type IMUSnapshot = {
	ctrl: number;
	mask: number;
	isr: number;
	index: number;
	stagedLo: number;
	prio: number[];
	handlers: number[];
	banks: number[];
	stagedBanks: number[];
	frames: IMUFrame[];
};

/**
 * The number of IDs (read back through IDS). More than 16 would follow the page layout of IMU.md ("More than 16
 * IDs"): IDs 16n to 16n+15 in the registers $40*n to $40*n+$3F, laid out as $00-$3F.
 */
export const IMU_IDS = 16;
/** The 16-bit masks (MASK, PENDING, INSERVICE): one bit per ID. */
const ID_BITS = (1 << IMU_IDS) - 1;

// Ports (offsets)
export const IMU_PORT_INDEX = 0;
export const IMU_PORT_DATALO = 1;
export const IMU_PORT_DATAHI = 2;
/** Read: CURRENT. Write: EOI. */
export const IMU_PORT_CURRENT = 3;

// Registers (through INDEX)
export const IMU_REG_CTRL = 0x00;
export const IMU_REG_MASK = 0x01;
export const IMU_REG_PENDING = 0x02;
export const IMU_REG_INSERVICE = 0x03;
/** Read-only: the number of IDs (see IMU.md, "More than 16 IDs"). */
export const IMU_REG_IDS = 0x04;
export const IMU_REG_PRIO = 0x10;
export const IMU_REG_HANDLER = 0x20;
export const IMU_REG_HBANK = 0x30;

export const IMU_CTRL_ENABLE = 0x80;
export const IMU_CTRL_AUTO_EOI = 0x40;

/** CURRENT when no handler is running. */
export const IMU_NONE = 0xff;

/**
 * Interrupt Management Unit: vectored interrupts for the 6502 (see IMU.md). Up to 16 lines (IDs), each with a
 * handler, a bank byte and a priority. The CPU asks it for the vector before it reads $FFFE (`irqVector`), and tells
 * it about every RTI (`onRti`). Disabled (the reset state), it only ORs its lines into the CPU's IRQ.
 *
 * Its 16 bytes of registers: INDEX (0), DATA LO / HI (1, 2) for the register INDEX selects, CURRENT / EOI (3).
 */
export class IMU {
	private ctrl = 0;
	private mask = 0;
	private asserted = 0;
	private isr = 0;
	private index = 0;
	private stagedLo = 0;
	private readonly prio = Array.from({ length: IMU_IDS }, () => 0);
	private readonly handlers = Array.from({ length: IMU_IDS }, () => 0);
	private readonly banks = Array.from({ length: IMU_IDS }, () => 0);
	private readonly stagedBanks = Array.from({ length: IMU_IDS }, () => 0);
	private frames: IMUFrame[] = [];
	private irqOut = false;

	constructor(private readonly options: IMUOptions) {
		this.reset();
	}

	reset() {
		this.ctrl = 0;
		this.mask = 0;
		this.isr = 0;
		this.index = 0;
		this.stagedLo = 0;
		for (let id = 0; id < IMU_IDS; id++) this.prio[id] = id;
		this.handlers.fill(0);
		this.banks.fill(0);
		this.stagedBanks.fill(0);
		this.frames = [];
		this.updateIrq();
	}

	get enabled() {
		return (this.ctrl & IMU_CTRL_ENABLE) !== 0;
	}

	get autoEoi() {
		return (this.ctrl & IMU_CTRL_AUTO_EOI) !== 0;
	}

	/** The CPU's IRQ line, as the IMU drives it. */
	get irqActive() {
		return this.irqOut;
	}

	/** A device's line (level-triggered). */
	setLine(id: number, active: boolean) {
		const bit = 1 << id;
		const asserted = active ? this.asserted | bit : this.asserted & ~bit;
		if (asserted === this.asserted) return;
		this.asserted = asserted;
		this.updateIrq();
	}

	/**
	 * The lines that can interrupt: not masked, and not blocked by an in-service ID of equal or higher priority
	 * (fully nested). Only meaningful with vectoring enabled.
	 */
	get eligible() {
		let eligible = this.asserted & ~this.mask & ID_BITS;
		if (this.isr === 0 || eligible === 0) return eligible;
		// The highest priority in service blocks itself and everything below it (PRIO is 8-bit)
		let top = 0x100;
		for (let id = 0; id < IMU_IDS; id++) if (this.isr & (1 << id)) top = Math.min(top, this.prio[id]!);
		for (let id = 0; id < IMU_IDS; id++) if (this.prio[id]! >= top) eligible &= ~(1 << id);
		return eligible;
	}

	/** The eligible ID with the lowest PRIO (ties: the lowest ID), undefined if none. */
	private winner(eligible: number): number | undefined {
		let winner: number | undefined;
		for (let id = 0; id < IMU_IDS; id++) {
			if (!(eligible & (1 << id))) continue;
			if (winner === undefined || this.prio[id]! < this.prio[winner]!) winner = id;
		}
		return winner;
	}

	/** The in-service ID with the highest priority (with auto-EOI: the innermost vectored handler), else $FF. */
	get current() {
		if (this.isr !== 0) return this.winner(this.isr)!;
		if (this.autoEoi) return this.frames.at(-1)?.id ?? IMU_NONE;
		return IMU_NONE;
	}

	private updateIrq() {
		const active = this.enabled ? this.eligible !== 0 : this.asserted !== 0;
		if (active === this.irqOut) return;
		this.irqOut = active;
		this.options.irq(active);
	}

	/**
	 * The IRQ's vector, asked by the CPU after the pushes (`sp`: the SP after them). The winner's handler, or
	 * undefined to go through $FFFE/F: vectoring disabled, nothing eligible, or a winner without a handler.
	 */
	irqVector(sp: number): IMUVector | undefined {
		if (!this.enabled) return undefined;
		const id = this.winner(this.eligible);
		if (id === undefined) return undefined;
		const address = this.handlers[id]!;
		if (address === 0) return undefined;

		if (!this.autoEoi) this.isr |= 1 << id;
		// The frames at or below this SP were abandoned: this IRQ's frame overwrites theirs
		while (this.frames.length && this.frames.at(-1)!.sp <= sp) this.frames.pop();
		const saved = this.options.context?.enter(this.banks[id]!) ?? 0;
		this.frames.push({ id, sp, saved });
		this.updateIrq();
		return { id, address };
	}

	/** Every RTI, before the pulls (`sp`: the SP before them). Restores the context of a vectored IRQ's frame. */
	onRti(sp: number) {
		// Abandoned frames: the stack has risen above them
		while (this.frames.length && this.frames.at(-1)!.sp < sp) this.frames.pop();
		const top = this.frames.at(-1);
		if (top?.sp !== sp) return;
		this.frames.pop();
		this.options.context?.exit(top.saved);
	}

	read(offset: number): number {
		switch (offset & 0x0f) {
			case IMU_PORT_INDEX:
				return this.index;
			case IMU_PORT_DATALO:
				return this.readRegister(this.index) & 0xff;
			case IMU_PORT_DATAHI:
				return this.readRegister(this.index) >> 8;
			case IMU_PORT_CURRENT:
				return this.current;
			default:
				return 0;
		}
	}

	write(offset: number, value: number) {
		value &= 0xff;
		switch (offset & 0x0f) {
			case IMU_PORT_INDEX:
				this.index = value;
				break;
			case IMU_PORT_DATALO:
				this.writeLo(this.index, value);
				break;
			case IMU_PORT_DATAHI:
				this.writeHi(this.index, value);
				break;
			case IMU_PORT_CURRENT:
				this.eoi();
				break;
		}
	}

	/** Non-specific EOI: clears the ISR bit of CURRENT. */
	eoi() {
		if (this.isr === 0) return;
		this.isr &= ~(1 << this.current);
		this.updateIrq();
	}

	/** A register's committed value (16 bits for the handlers), 0 for the reserved ones. */
	readRegister(reg: number): number {
		if (reg >= IMU_REG_PRIO && reg < IMU_REG_PRIO + IMU_IDS) return this.prio[reg - IMU_REG_PRIO]!;
		if (reg >= IMU_REG_HANDLER && reg < IMU_REG_HANDLER + IMU_IDS) return this.handlers[reg - IMU_REG_HANDLER]!;
		if (reg >= IMU_REG_HBANK && reg < IMU_REG_HBANK + IMU_IDS) return this.banks[reg - IMU_REG_HBANK]!;
		switch (reg) {
			case IMU_REG_CTRL:
				return this.ctrl;
			case IMU_REG_MASK:
				return this.mask;
			case IMU_REG_PENDING:
				return this.asserted;
			case IMU_REG_INSERVICE:
				return this.isr;
			case IMU_REG_IDS:
				return IMU_IDS;
			default:
				return 0;
		}
	}

	/** DATA LO: the 8-bit registers take it at once, a handler's low byte and the banks are staged. */
	private writeLo(reg: number, value: number) {
		if (reg >= IMU_REG_PRIO && reg < IMU_REG_PRIO + IMU_IDS) {
			this.prio[reg - IMU_REG_PRIO] = value;
			this.updateIrq();
		} else if (reg >= IMU_REG_HANDLER && reg < IMU_REG_HANDLER + IMU_IDS) this.stagedLo = value;
		else if (reg >= IMU_REG_HBANK && reg < IMU_REG_HBANK + IMU_IDS) this.stagedBanks[reg - IMU_REG_HBANK] = value;
		else if (reg === IMU_REG_MASK) this.stagedLo = value;
		else if (reg === IMU_REG_CTRL) {
			this.ctrl = value & (IMU_CTRL_ENABLE | IMU_CTRL_AUTO_EOI);
			this.updateIrq();
		}
	}

	/** DATA HI: commits a 16-bit register (both bytes): MASK, or a handler with its staged bank. Else ignored. */
	private writeHi(reg: number, value: number) {
		if (reg === IMU_REG_MASK) {
			this.mask = (value << 8) | this.stagedLo;
			this.updateIrq();
			return;
		}
		if (reg < IMU_REG_HANDLER || reg >= IMU_REG_HANDLER + IMU_IDS) return;
		const id = reg - IMU_REG_HANDLER;
		this.handlers[id] = (value << 8) | this.stagedLo;
		this.banks[id] = this.stagedBanks[id]!;
	}

	/** The vectored dispatches not yet returned from, innermost last (for the debugger). */
	getFrames(): readonly IMUFrame[] {
		return this.frames;
	}

	/** Everything the debugger shows, without side effects. */
	getState(): IMUState {
		return {
			ctrl: this.ctrl,
			enabled: this.enabled,
			autoEoi: this.autoEoi,
			mask: this.mask,
			pending: this.asserted,
			inService: this.isr,
			eligible: this.enabled ? this.eligible : 0,
			current: this.current,
			irq: this.irqOut,
			index: this.index,
			lines: this.prio.map((prio, id) => ({ id, prio, handler: this.handlers[id]!, bank: this.banks[id]! })),
			frames: this.frames.map((frame) => ({ ...frame })),
		};
	}

	snapshot(): IMUSnapshot {
		return {
			ctrl: this.ctrl,
			mask: this.mask,
			isr: this.isr,
			index: this.index,
			stagedLo: this.stagedLo,
			prio: [...this.prio],
			handlers: [...this.handlers],
			banks: [...this.banks],
			stagedBanks: [...this.stagedBanks],
			frames: this.frames.map((frame) => ({ ...frame })),
		};
	}

	restoreSnapshot(state: IMUSnapshot) {
		this.reset(); // a state saved with fewer IDs leaves the others as reset
		this.ctrl = state.ctrl;
		this.mask = state.mask;
		this.isr = state.isr;
		this.index = state.index;
		this.stagedLo = state.stagedLo;
		state.prio.forEach((value, id) => (this.prio[id] = value));
		state.handlers.forEach((value, id) => (this.handlers[id] = value));
		state.banks.forEach((value, id) => (this.banks[id] = value));
		state.stagedBanks.forEach((value, id) => (this.stagedBanks[id] = value));
		this.frames = state.frames.map((frame) => ({ ...frame }));
		this.updateIrq();
	}
}
