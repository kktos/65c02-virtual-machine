export interface PIAHandlers {
	/** What the outside world drives on the port's pins (the bits the DDR leaves as inputs). Default: all high. */
	readPortA?: () => number;
	readPortB?: () => number;
	/** The port's output register was written. `value` is the output register, `ddr` which bits are outputs. */
	writePortA?: (value: number, ddr: number) => void;
	writePortB?: (value: number, ddr: number) => void;
	/** IRQA or IRQB changed (the machine usually ties both to the CPU's IRQ). */
	irq?: (active: boolean) => void;
}

/** What a save state keeps of a PIA. */
export type PIASnapshot = { ora: number; ddra: number; cra: number; orb: number; ddrb: number; crb: number };

// Control register bits
const CR_C1_IRQ_ENABLE = 0x01;
const CR_PORT_SELECT = 0x04; // 0: the DDR, 1: the port (output register / pins)
const CR_C2_IRQ_ENABLE = 0x08; // C2 as an input
const CR_C2_LEVEL = 0x08; // C2 as a manual output
const CR_C2_MANUAL = 0x10;
const CR_C2_OUTPUT = 0x20;
const CR_IRQ2_FLAG = 0x40; // C2 active transition
const CR_IRQ1_FLAG = 0x80; // C1 active transition

/**
 * The Motorola 6821 PIA: two 8-bit ports (A, B), each with a data direction register and a control register, and
 * two control lines per port (CA1/CA2, CB1/CB2) that set the IRQ flags. Registers, by the 2 address lines RS1-RS0:
 * 0 port A or DDRA (CRA bit 2), 1 CRA, 2 port B or DDRB (CRB bit 2), 3 CRB.
 *
 * Reading a port clears its two IRQ flags. C2 as an output (CR bit 5): only the manual mode (bit 4 set, the
 * level in bit 3); the handshake / pulse modes leave it high.
 */
export class PIA6821 {
	private ora = 0;
	private ddra = 0;
	private cra = 0;
	private orb = 0;
	private ddrb = 0;
	private crb = 0;
	private irqActive = false;

	constructor(private readonly handlers: PIAHandlers = {}) {}

	reset() {
		this.ora = this.ddra = this.cra = 0;
		this.orb = this.ddrb = this.crb = 0;
		this.updateIrq();
	}

	/** Port A as the pins are: the outputs from ORA, the inputs from outside. */
	get portA() {
		return (this.ora & this.ddra) | ((this.handlers.readPortA?.() ?? 0xff) & ~this.ddra & 0xff);
	}

	get portB() {
		return (this.orb & this.ddrb) | ((this.handlers.readPortB?.() ?? 0xff) & ~this.ddrb & 0xff);
	}

	/** The output register A, whatever the DDR (what the chip drives on its output pins). */
	get outputA() {
		return this.ora & this.ddra;
	}

	get outputB() {
		return this.orb & this.ddrb;
	}

	/** CA2's level: low only as a manual output set low; an input (or the other output modes) is high. */
	get ca2() {
		return c2Level(this.cra);
	}

	get cb2() {
		return c2Level(this.crb);
	}

	read(register: number): number {
		switch (register & 3) {
			case 0:
				if (!(this.cra & CR_PORT_SELECT)) return this.ddra;
				this.cra &= ~(CR_IRQ1_FLAG | CR_IRQ2_FLAG);
				this.updateIrq();
				return this.portA;
			case 1:
				return this.cra;
			case 2:
				if (!(this.crb & CR_PORT_SELECT)) return this.ddrb;
				this.crb &= ~(CR_IRQ1_FLAG | CR_IRQ2_FLAG);
				this.updateIrq();
				return this.portB;
			default:
				return this.crb;
		}
	}

	/** A read without side effects (the IRQ flags stay), for the debugger. */
	peek(register: number): number {
		switch (register & 3) {
			case 0:
				return this.cra & CR_PORT_SELECT ? this.portA : this.ddra;
			case 1:
				return this.cra;
			case 2:
				return this.crb & CR_PORT_SELECT ? this.portB : this.ddrb;
			default:
				return this.crb;
		}
	}

	write(register: number, value: number) {
		value &= 0xff;
		switch (register & 3) {
			case 0:
				if (this.cra & CR_PORT_SELECT) {
					this.ora = value;
					this.handlers.writePortA?.(this.ora, this.ddra);
				} else this.ddra = value;
				break;
			case 1:
				// The flags (bits 7-6) are read-only
				this.cra = (this.cra & 0xc0) | (value & 0x3f);
				this.updateIrq();
				break;
			case 2:
				if (this.crb & CR_PORT_SELECT) {
					this.orb = value;
					this.handlers.writePortB?.(this.orb, this.ddrb);
				} else this.ddrb = value;
				break;
			default:
				this.crb = (this.crb & 0xc0) | (value & 0x3f);
				this.updateIrq();
				break;
		}
	}

	/** An active transition on CA1 (whatever edge CRA selects): sets the CA1 flag. */
	pulseCA1() {
		this.cra |= CR_IRQ1_FLAG;
		this.updateIrq();
	}

	/** An active transition on CB1 (whatever edge CRB selects): sets the CB1 flag. */
	pulseCB1() {
		this.crb |= CR_IRQ1_FLAG;
		this.updateIrq();
	}

	get irq() {
		return this.irqActive;
	}

	snapshot(): PIASnapshot {
		const { ora, ddra, cra, orb, ddrb, crb } = this;
		return { ora, ddra, cra, orb, ddrb, crb };
	}

	restoreSnapshot(state: PIASnapshot) {
		({ ora: this.ora, ddra: this.ddra, cra: this.cra, orb: this.orb, ddrb: this.ddrb, crb: this.crb } = state);
		this.updateIrq();
	}

	private updateIrq() {
		const side = (cr: number) =>
			(cr & CR_IRQ1_FLAG && cr & CR_C1_IRQ_ENABLE) ||
			(cr & CR_IRQ2_FLAG && !(cr & CR_C2_OUTPUT) && cr & CR_C2_IRQ_ENABLE);
		const active = !!(side(this.cra) || side(this.crb));
		if (active === this.irqActive) return;
		this.irqActive = active;
		this.handlers.irq?.(active);
	}
}

const c2Level = (cr: number) => (cr & (CR_C2_OUTPUT | CR_C2_MANUAL)) !== (CR_C2_OUTPUT | CR_C2_MANUAL) || (cr & CR_C2_LEVEL) !== 0;
