export interface VIAHandlers {
	/** The port A pins changed (an ORA or DDRA write): the outputs, the inputs pulled high. */
	writePortA?: (val: number) => void;
	/** The port B pins changed (an ORB or DDRB write): the outputs, the inputs pulled high. */
	writePortB?: (val: number) => void;
	readPortA?: () => number;
	readPortB?: () => number;
	irq?: (active: boolean) => void;
}

/** What a save state keeps of a VIA. */
export type VIASnapshot = {
	regs: number[];
	t1c: number;
	t1l: number;
	t1Active: boolean;
	t2c: number;
	t2l: number;
	t2Active: boolean;
	ier: number;
	ifr: number;
};

const REG_ORB = 0x00;
const REG_ORA = 0x01;
const REG_DDRB = 0x02;
const REG_DDRA = 0x03;
const REG_ACR = 0x0b;

const ACR_T1_FREE_RUN = 0x40;
const ACR_T2_COUNT_PB6 = 0x20;

const IFR_T1 = 0x40;
const IFR_T2 = 0x20;

/**
 * MOS 6522 VIA: two 8-bit ports, two 16-bit timers and the interrupt flags/enables.
 *
 * The timers always count down at the clock (as the real chip, which is how software detects a VIA: two reads of
 * T1C-L differ). Writing T1C-H/T2C-H loads the counter and arms its interrupt: T1 in one-shot mode (ACR bit 6
 * clear) interrupts once, then counts on from $FFFF; in free-run mode it reloads from its latch (N+2 cycles) and
 * interrupts at each underflow. T2 is one-shot (its pulse counting mode, on PB6, isn't emulated: it stops).
 * No shift register, no handshakes (CA/CB lines).
 */
export class VIA6522 {
	private regs = new Uint8Array(16);
	private handlers: VIAHandlers;

	// Timers
	private t1c = 0xffff; // Timer 1 Counter
	private t1l = 0xffff; // Timer 1 Latch
	private t1Active = false; // its interrupt armed (one-shot mode)

	private t2c = 0xffff; // Timer 2 Counter
	private t2l = 0xff; // Timer 2 Latch (low byte)
	private t2Active = false; // its interrupt armed

	// Interrupts
	private ier = 0; // Interrupt Enable Register
	private ifr = 0; // Interrupt Flag Register

	constructor(handlers: VIAHandlers) {
		this.handlers = handlers;
	}

	/** The RES line: the registers clear (ports as inputs, interrupts off); the timers and latches stay. */
	public reset() {
		this.regs.fill(0);
		this.ier = 0;
		this.ifr = 0;
		this.t1Active = false;
		this.t2Active = false;
		this.handlers.writePortA?.(this.portA);
		this.handlers.writePortB?.(this.portB);
		this.updateIrq();
	}

	/** The port A pins: the outputs (ORA where DDRA is set), the inputs pulled high. */
	public get portA() {
		return (this.regs[REG_ORA]! & this.regs[REG_DDRA]!) | (~this.regs[REG_DDRA]! & 0xff);
	}

	/** The port B pins: the outputs (ORB where DDRB is set), the inputs pulled high. */
	public get portB() {
		return (this.regs[REG_ORB]! & this.regs[REG_DDRB]!) | (~this.regs[REG_DDRB]! & 0xff);
	}

	public tick(cycles: number) {
		// Timer 1
		this.t1c -= cycles;
		if (this.t1c < 0) {
			if (this.regs[REG_ACR]! & ACR_T1_FREE_RUN) {
				const period = this.t1l + 2;
				while (this.t1c < 0) this.t1c += period;
				this.ifr |= IFR_T1;
				this.updateIrq();
			} else {
				this.t1c &= 0xffff; // counts on from $FFFF
				if (this.t1Active) {
					this.t1Active = false;
					this.ifr |= IFR_T1;
					this.updateIrq();
				}
			}
		}

		// Timer 2 (in pulse counting mode, it counts PB6 pulses: none here)
		if (this.regs[REG_ACR]! & ACR_T2_COUNT_PB6) return;
		this.t2c -= cycles;
		if (this.t2c < 0) {
			this.t2c &= 0xffff;
			if (this.t2Active) {
				this.t2Active = false;
				this.ifr |= IFR_T2;
				this.updateIrq();
			}
		}
	}

	public read(offset: number): number {
		switch (offset) {
			case 0x00: // ORB / IRB
				return (
					((this.handlers.readPortB ? this.handlers.readPortB() : this.regs[REG_ORB]!) & ~this.regs[REG_DDRB]!) |
					(this.regs[REG_ORB]! & this.regs[REG_DDRB]!)
				);
			case 0x01: // ORA / IRA
			case 0x0f: // ORA / IRA, no handshake
				return (
					((this.handlers.readPortA ? this.handlers.readPortA() : this.regs[REG_ORA]!) & ~this.regs[REG_DDRA]!) |
					(this.regs[REG_ORA]! & this.regs[REG_DDRA]!)
				);
			case 0x04: // T1C-L
				this.ifr &= ~IFR_T1; // Clear T1 Interrupt
				this.updateIrq();
				return this.t1c & 0xff;
			case 0x05: // T1C-H
				return (this.t1c >> 8) & 0xff;
			case 0x06: // T1L-L
				return this.t1l & 0xff;
			case 0x07: // T1L-H
				return (this.t1l >> 8) & 0xff;
			case 0x08: // T2C-L
				this.ifr &= ~IFR_T2; // Clear T2 Interrupt
				this.updateIrq();
				return this.t2c & 0xff;
			case 0x09: // T2C-H
				return (this.t2c >> 8) & 0xff;
			case 0x0d: // IFR
				return this.ifr;
			case 0x0e: // IER
				return this.ier | 0x80;
			default:
				return this.regs[offset] ?? 0;
		}
	}

	/** A read without side effects (the timer flags stay), for the debugger. */
	public peek(offset: number): number {
		switch (offset) {
			case 0x04:
				return this.t1c & 0xff;
			case 0x08:
				return this.t2c & 0xff;
			case 0x00:
			case 0x01:
			case 0x0f:
				return this.regs[offset === 0x0f ? REG_ORA : offset] ?? 0; // the output register (reading the pins may have effects)
			default:
				return this.read(offset);
		}
	}

	public get irq() {
		return (this.ifr & this.ier & 0x7f) !== 0;
	}

	public snapshot(): VIASnapshot {
		const { t1c, t1l, t1Active, t2c, t2l, t2Active, ier, ifr } = this;
		return { regs: [...this.regs], t1c, t1l, t1Active, t2c, t2l, t2Active, ier, ifr };
	}

	public restoreSnapshot(state: VIASnapshot) {
		this.regs.set(state.regs);
		({
			t1c: this.t1c,
			t1l: this.t1l,
			t1Active: this.t1Active,
			t2c: this.t2c,
			t2l: this.t2l,
			t2Active: this.t2Active,
			ier: this.ier,
			ifr: this.ifr,
		} = state);
		this.updateIrq();
	}

	public write(offset: number, value: number) {
		switch (offset) {
			case 0x00: // ORB
			case 0x02: {
				// DDRB
				const before = this.portB;
				this.regs[offset] = value;
				if (this.portB !== before) this.handlers.writePortB?.(this.portB);
				break;
			}
			case 0x01: // ORA
			case 0x0f: // ORA, no handshake
			case 0x03: {
				// DDRA
				const before = this.portA;
				this.regs[offset === 0x0f ? REG_ORA : offset] = value;
				if (this.portA !== before) this.handlers.writePortA?.(this.portA);
				break;
			}
			case 0x04: // T1L-L
			case 0x06: // T1L-L
				this.t1l = (this.t1l & 0xff00) | value;
				break;
			case 0x05: // T1C-H (Write triggers load)
				this.t1l = (this.t1l & 0x00ff) | (value << 8);
				this.t1c = this.t1l;
				this.t1Active = true;
				this.ifr &= ~IFR_T1; // Clear T1 Interrupt
				this.updateIrq();
				break;
			case 0x07: // T1L-H
				this.t1l = (this.t1l & 0x00ff) | (value << 8);
				this.ifr &= ~IFR_T1; // Clear T1 Interrupt
				this.updateIrq();
				break;
			case 0x08: // T2L-L
				this.t2l = value;
				break;
			case 0x09: // T2C-H (Write triggers load)
				this.t2c = (value << 8) | this.t2l;
				this.t2Active = true;
				this.ifr &= ~IFR_T2; // Clear T2 Interrupt
				this.updateIrq();
				break;
			case 0x0d: // IFR
				// Write 1 to bit clears that bit
				this.ifr &= ~value;
				this.updateIrq();
				break;
			case 0x0e: // IER
				if (value & 0x80) {
					// Set bits
					this.ier |= value & 0x7f;
				} else {
					// Clear bits
					this.ier &= ~(value & 0x7f);
				}
				this.updateIrq();
				break;
			default: // SR, ACR, PCR
				this.regs[offset] = value;
				break;
		}
	}

	private updateIrq() {
		const active = (this.ifr & this.ier & 0x7f) !== 0;
		if (active) {
			this.ifr |= 0x80;
		} else {
			this.ifr &= 0x7f;
		}
		this.handlers.irq?.(active);
	}
}
