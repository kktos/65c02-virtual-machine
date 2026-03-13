import type { IBus } from "@/virtualmachine/cpu/bus.interface";
import {
	FLAG_C_MASK,
	INPUT_ANALOG_0_OFFSET,
	INPUT_DIGITAL_OFFSET,
	REG_A_OFFSET,
	REG_STATUS_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import type { ISlotCard } from "./slotcard.interface";

// AppleMouse II User Manual
// https://mirrors.apple2.org.za/ftp.apple.asimov.net/documentation/hardware/io/AppleMouse%20II%20User%27s%20Manual.pdf

const SETMOUSE = 0x12;
const SERVEMOUSE = 0x13;
const READMOUSE = 0x14;
const CLEARMOUSE = 0x15;
const POSMOUSE = 0x16;
const CLAMPMOUSE = 0x17;
const HOMEMOUSE = 0x18;
const INITMOUSE = 0x19;

export class MouseCard implements ISlotCard {
	private registers!: DataView;

	// Mouse State
	private x = 0;
	private y = 0;
	private lastButton0 = false;
	private button0 = false;
	private lastButton1 = false;
	private button1 = false;

	// Clamping
	private minX = 0;
	private maxX = 1023; // Default Apple Mouse range
	private minY = 0;
	private maxY = 1023;

	// Bit 	  0 : Turn mouse on
	// Bit 	  0 : Turn mouse on
	//		  1 : Enable interrupts on mouse movement
	// 		  2 : Enable interrupts when button pressed
	// 		  3 : Enable interrupts every screen refresh
	// Bits	4-7 : Reserved
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
		//technote Mouse #5: Check on Mouse Firmware Card
		this.rom[0x0c] = 0x20;
		this.rom[0xfb] = 0xd6;

		// --- HLE Vector Table ---
		// The firmware card has a vector table from $Cn12 to $Cn19.
		// Each byte is the low-byte of the address for a specific mouse function.
		// The high-byte is implicitly $Cn.
		// We will create small HLE routines that trigger our I/O handlers,
		// and point the vectors to these routines.

		const ioBase = 0xc080 + (this.slot << 4);
		const ioLo = ioBase & 0xff;
		const ioHi = ioBase >> 8;

		// This function creates a small routine: STA $C0C[x]; RTS
		const writeHleRoutine = (romOffset: number, ioOffset: number) => {
			this.rom[romOffset] = 0x8d; // STA Absolute
			this.rom[romOffset + 1] = ioLo + ioOffset;
			this.rom[romOffset + 2] = ioHi;
			this.rom[romOffset + 3] = 0x60; // RTS
		};

		// Define where our HLE routines will live in the 256-byte ROM space
		const hleBase = 0x40;
		type Command = { vector: number; io: number };
		const commands: Command[] = [
			{ vector: SETMOUSE, io: 0x00 },
			{ vector: SERVEMOUSE, io: 0x01 },
			{ vector: READMOUSE, io: 0x02 },
			{ vector: CLEARMOUSE, io: 0x03 },
			{ vector: POSMOUSE, io: 0x04 },
			{ vector: CLAMPMOUSE, io: 0x05 },
			{ vector: HOMEMOUSE, io: 0x06 },
			{ vector: INITMOUSE, io: 0x07 },
		];

		// Create the HLE routines and populate the vector table
		for (let i = 0; i < commands.length; i++) {
			const { vector, io } = commands[i] as Command;
			const routineAddr = hleBase + i * 4;
			writeHleRoutine(routineAddr, io);
			this.rom[vector] = routineAddr;
		}
	}

	setRegisters(view: DataView) {
		this.registers = view;
	}

	tick?(_cycles: number): Float32Array[] {
		// Read Mouse Axes (Indices 2 & 3 -> Offsets +8 & +12)
		const mx = this.registers.getFloat32(INPUT_ANALOG_0_OFFSET + 8, true);
		const my = this.registers.getFloat32(INPUT_ANALOG_0_OFFSET + 12, true);
		const digital1 = this.registers.getUint8(INPUT_DIGITAL_OFFSET);
		const mb0 = (digital1 & 0b0000_0100) !== 0;
		const mb1 = (digital1 & 0b0000_1000) !== 0;
		this.setMouse(Math.max(0, Math.min(1, mx)) * 1023, Math.max(0, Math.min(1, my)) * 1023, mb0, mb1);

		return [];
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

		// const COMMANDS = [
		// 	"SETMOUSE",
		// 	"SERVEMOUSE",
		// 	"READMOUSE",
		// 	"CLEARMOUSE",
		// 	"POSMOUSE",
		// 	"CLAMPMOUSE",
		// 	"HOMEMOUSE",
		// 	"INITMOUSE",
		// ];
		// console.log("--- MOUSE ", COMMANDS[offset], "Acc", this.registers.getUint8(REG_A_OFFSET));

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

		/*
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
		if (this.button1) status |= 0x40;

		this.registers?.setUint8(REG_A_OFFSET, status);
*/
		this.clearCarry();
	}

	private cmdServeMouse() {
		this.updateScreenHoles();
		this.clearCarry();
	}

	private cmdSetMouse() {
		// A = Mode
		if (this.registers) this.mode = this.registers.getUint8(REG_A_OFFSET);
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
		// $478 + n		Low byte of X position
		// $4F8 + n 	Low byte of Y position
		// $578 + n 	High byte of X position
		// $5F8 + n 	High byte of Y position
		// $678 + n 	Reserved
		// $6F8 + n 	Reserved
		// $778 + n 	Button and interrupt status
		// $7F8 + n 	Current mode

		const base = 0x0478 + this.slot;

		// X Coordinate
		this.bus.write(base, this.x & 0xff);
		this.bus.write(base + 0x100, (this.x >> 8) & 0xff);

		// Y Coordinate
		this.bus.write(base + 0x80, this.y & 0xff);
		this.bus.write(base + 0x180, (this.y >> 8) & 0xff);

		// button & interrupt status
		// Bit 	7: Button is down
		// 		6: Button was down at last reading
		// 		5: X or Y changed since last reading
		// 		4: Reserved
		// 		3: Interrupt caused by screen refresh
		// 		2: Interrupt caused by button press
		// 		1: Interrupt caused by mouse movement
		// 		0: Reserved
		let status = 0;
		if (this.button0) status |= 0x80;
		if (this.lastButton0) status |= 0x40;
		this.bus.write(0x778 + this.slot, status);

		this.lastButton0 = this.button0;

		// mode
		this.bus.write(0x7f8 + this.slot, this.mode);
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
