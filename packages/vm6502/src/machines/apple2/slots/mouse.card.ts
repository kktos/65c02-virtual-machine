import type { IBus } from "@/virtualmachine/cpu/bus.interface";
import {
	FLAG_C_MASK,
	REG_A_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import type { ISlotCard } from "./slotcard.interface";

export class MouseCard implements ISlotCard {
	private registers?: DataView;

	// Mouse State
	private x = 0;
	private y = 0;
	private button0 = false;
	private button1 = false;

	// Clamping
	private minX = 0;
	private maxX = 1023; // Default Apple Mouse range
	private minY = 0;
	private maxY = 1023;

	private mode = 0;

	constructor(
		private bus: IBus,
		public slot: number,
		private rom: Uint8Array,
	) {
		this.initRom();
	}

	private initRom() {
		// --- Mouse Card Identification ---
		// $Cn05 = $38
		// $Cn07 = $18
		// $Cn0B = $01
		// $Cn0C = $20
		this.rom[0x05] = 0x38;
		this.rom[0x07] = 0x18;
		this.rom[0x0b] = 0x01;
		this.rom[0x0c] = 0x20;

		// --- HLE Entry Points ---
		// We construct JMP instructions to the card's I/O space ($C080 + slot*16).
		// Writing to these I/O addresses will trigger our writeIo handler.
		// Slot 4 I/O base is $C0C0.

		const ioBase = 0xc080 + (this.slot << 4);
		const ioLo = ioBase & 0xff;
		const ioHi = ioBase >> 8;

		const writeJmp = (addr: number, cmd: number) => {
			this.rom[addr] = 0x8d; // STA Absolute
			this.rom[addr + 1] = ioLo + cmd;
			this.rom[addr + 2] = ioHi;
			this.rom[addr + 3] = 0x60; // RTS
		};

		// Standard Pascal/Firmware Interface Offsets
		writeJmp(0x12, 0x00); // SETMOUSE
		writeJmp(0x19, 0x01); // SERVEMOUSE
		writeJmp(0x1c, 0x02); // READMOUSE
		writeJmp(0x1f, 0x03); // CLEARMOUSE
		writeJmp(0x22, 0x04); // POSMOUSE
		writeJmp(0x25, 0x05); // CLAMPMOUSE
		writeJmp(0x28, 0x06); // HOMEMOUSE
		writeJmp(0x2b, 0x07); // INITMOUSE
	}

	setRegisters(view: DataView) {
		this.registers = view;
	}

	readRom(offset: number): number {
		return this.rom[offset] ?? 0;
	}

	readExpansion(_offset: number): number {
		return 0;
	}

	readIo(_offset: number): number {
		return 0;
	}

	writeIo(offset: number, _value: number): void {
		if (!this.registers) return;

		switch (offset) {
			case 0x00:
				this.cmdSetMouse();
				break;
			case 0x01:
				this.cmdServeMouse();
				break;
			case 0x02:
				this.cmdReadMouse();
				break;
			case 0x03:
				this.cmdClearMouse();
				break;
			case 0x04:
				this.cmdPosMouse();
				break;
			case 0x05:
				this.cmdClampMouse();
				break;
			case 0x06:
				this.cmdHomeMouse();
				break;
			case 0x07:
				this.cmdInitMouse();
				break;
		}
	}

	// --- Commands ---

	private cmdInitMouse() {
		this.minX = 0;
		this.maxX = 1023;
		this.minY = 0;
		this.maxY = 1023;
		this.x = 0;
		this.y = 0;
		this.mode = 0;
		this.registers?.setUint8(REG_A_OFFSET, 0);
		this.clearCarry();
	}

	private cmdHomeMouse() {
		this.x = 0;
		this.y = 0;
		this.clearCarry();
	}

	private cmdReadMouse() {
		// Update Screen Holes with current position
		this.updateScreenHoles();

		// Return Low X in X Register, High X in Y Register
		const lowX = this.x & 0xff;
		const highX = (this.x >> 8) & 0xff;

		this.registers?.setUint8(REG_X_OFFSET, lowX);
		this.registers?.setUint8(REG_Y_OFFSET, highX);

		// Status in Accumulator
		// Bit 7: Button 0 (1 = down? Standard varies, usually 0=down for some, 1=down for others.
		// Apple Mouse II: 1 = Button Down (if configured active high) or interrupt status.
		// For HLE, we often assume bit 7 set if button is down.
		let status = 0;
		if (this.button0) status |= 0x80;
		// if (this.button1) status |= 0x40;

		this.registers?.setUint8(REG_A_OFFSET, status);
		this.clearCarry();
	}

	private cmdServeMouse() {
		this.updateScreenHoles();
		this.clearCarry();
	}

	private cmdSetMouse() {
		// A = Mode
		if (this.registers) {
			this.mode = this.registers.getUint8(REG_A_OFFSET);
		}
		this.clearCarry();
	}

	private cmdClearMouse() {
		this.x = 0;
		this.y = 0;
		this.clearCarry();
	}

	private cmdPosMouse() {
		// Read X/Y from screen holes or registers and set internal state
		// For HLE, we might just ignore this or implement if needed.
		this.clearCarry();
	}

	private cmdClampMouse() {
		// Sets min/max windows.
		// A = 0 (X), 1 (Y)
		// X = Low, Y = High
		// We'll stub this as success for now.
		this.clearCarry();
	}

	// --- Helpers ---

	private updateScreenHoles() {
		// Screen Holes for Slot N:
		// $0478 + N
		// $0578 + N
		// $04F8 + N
		// $05F8 + N
		const base = 0x0478 + this.slot;

		// X Coordinate
		this.bus.write(base, this.x & 0xff);
		this.bus.write(base + 0x100, (this.x >> 8) & 0xff);

		// Y Coordinate
		this.bus.write(base + 0x80, this.y & 0xff);
		this.bus.write(base + 0x180, (this.y >> 8) & 0xff);
	}

	private clearCarry() {
		if (!this.registers) return;
		const status = this.registers.getUint8(REG_STATUS_OFFSET);
		this.registers.setUint8(REG_STATUS_OFFSET, status & ~FLAG_C_MASK);
	}

	// --- Public Interface for Host ---

	public setMouse(x: number, y: number, button0: boolean, button1: boolean) {
		this.x = Math.max(this.minX, Math.min(this.maxX, x));
		this.y = Math.max(this.minY, Math.min(this.maxY, y));
		this.button0 = button0;
		this.button1 = button1;
	}
}
