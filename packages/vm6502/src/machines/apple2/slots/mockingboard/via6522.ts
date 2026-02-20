export interface VIAHandlers {
	writePortA?: (val: number) => void;
	writePortB?: (val: number) => void;
	readPortA?: () => number;
	readPortB?: () => number;
	irq?: (active: boolean) => void;
}

export class VIA6522 {
	private regs = new Uint8Array(16);
	private handlers: VIAHandlers;

	// Timers
	private t1c = 0; // Timer 1 Counter
	private t1l = 0; // Timer 1 Latch
	private t1Active = false;
	private t1Pb7 = false; // PB7 output enabled

	private t2c = 0; // Timer 2 Counter
	private t2l = 0; // Timer 2 Latch
	private t2Active = false;

	// Interrupts
	private ier = 0; // Interrupt Enable Register
	private ifr = 0; // Interrupt Flag Register

	constructor(handlers: VIAHandlers) {
		this.handlers = handlers;
	}

	public reset() {
		this.regs.fill(0);
		this.ier = 0;
		this.ifr = 0;
		this.t1Active = false;
		this.t2Active = false;
	}

	public tick(cycles: number) {
		// Timer 1
		if (this.t1Active) {
			this.t1c -= cycles;
			while (this.t1c < 0) {
				// Reload or stop based on ACR bit 6 (0=One-shot, 1=Free-run)
				if (this.regs[0x0b] & 0x40) {
					this.t1c += this.t1l + 2; // Free-run
				} else {
					this.t1c += 0x10000; // Wrap around (One-shot continues counting down)
					// In one-shot, interrupt happens at transition through 0, but counter continues
				}
				this.ifr |= 0x40; // Set T1 Interrupt Flag
				this.updateIrq();
			}
		}

		// Timer 2
		if (this.t2Active) {
			this.t2c -= cycles;
			if (this.t2c < 0) {
				this.t2c += 0x10000;
				this.t2Active = false; // T2 is always one-shot (unless counting pulses, which we don't emulate here)
				this.ifr |= 0x20; // Set T2 Interrupt Flag
				this.updateIrq();
			}
		}
	}

	public read(offset: number): number {
		switch (offset) {
			case 0x00: // ORB / IRB
				return ((this.handlers.readPortB ? this.handlers.readPortB() : this.regs[0x00]) & ~this.regs[0x02]) | (this.regs[0x00] & this.regs[0x02]);
			case 0x01: // ORA / IRA
				return ((this.handlers.readPortA ? this.handlers.readPortA() : this.regs[0x01]) & ~this.regs[0x03]) | (this.regs[0x01] & this.regs[0x03]);
			case 0x04: // T1C-L
				this.ifr &= ~0x40; // Clear T1 Interrupt
				this.updateIrq();
				return this.t1c & 0xff;
			case 0x05: // T1C-H
				return (this.t1c >> 8) & 0xff;
			case 0x08: // T2C-L
				this.ifr &= ~0x20; // Clear T2 Interrupt
				this.updateIrq();
				return this.t2c & 0xff;
			case 0x09: // T2C-H
				return (this.t2c >> 8) & 0xff;
			case 0x0d: // IFR
				return this.ifr;
			case 0x0e: // IER
				return this.ier | 0x80;
			default:
				return this.regs[offset];
		}
	}

	public write(offset: number, value: number) {
		switch (offset) {
			case 0x00: // ORB
				this.regs[0x00] = value;
				this.handlers.writePortB?.(value);
				break;
			case 0x01: // ORA
				this.regs[0x01] = value;
				this.handlers.writePortA?.(value);
				break;
			case 0x02: // DDRB
			case 0x03: // DDRA
				this.regs[offset] = value;
				break;
			case 0x04: // T1L-L
				this.t1l = (this.t1l & 0xff00) | value;
				break;
			case 0x05: // T1C-H (Write triggers load)
				this.t1l = (this.t1l & 0x00ff) | (value << 8);
				this.t1c = this.t1l;
				this.t1Active = true;
				this.ifr &= ~0x40; // Clear T1 Interrupt
				this.updateIrq();
				break;
			case 0x06: // T1L-L
				this.t1l = (this.t1l & 0xff00) | value;
				break;
			case 0x07: // T1L-H
				this.t1l = (this.t1l & 0x00ff) | (value << 8);
				break;
			case 0x08: // T2L-L
				this.t2l = value;
				break;
			case 0x09: // T2C-H (Write triggers load)
				this.t2c = (value << 8) | this.t2l;
				this.t2Active = true;
				this.ifr &= ~0x20; // Clear T2 Interrupt
				this.updateIrq();
				break;
			case 0x0b: // ACR
				this.regs[offset] = value;
				break;
			case 0x0c: // PCR
				this.regs[offset] = value;
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
			default:
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
