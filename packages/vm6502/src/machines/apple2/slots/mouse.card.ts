import type { IBus } from "@/types/bus.interface";
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

/**
 * The host sends the mouse as a position that wraps around: analog inputs 2 & 3 hold (units mod HOST_RANGE) / HOST_RANGE
 * (see MouseControl.vue). The card only uses the movement between two ticks, like the real mouse, which counts
 * motion: its own position lives in the clamping window, and what goes past an edge is lost, not banked.
 */
export const MOUSE_HOST_RANGE = 1024;

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 1023;

/** Screen holes: $0478+n etc. for the card in slot n; CLAMPMOUSE reads its bounds in slot 0's ($0478...). */
const HOLE_X_LO = 0x0478;
const HOLE_Y_LO = 0x04f8;
const HOLE_X_HI = 0x0578;
const HOLE_Y_HI = 0x05f8;
const HOLE_STATUS = 0x0778;
const HOLE_MODE = 0x07f8;

const toInt16 = (lo: number, hi: number) => {
	const v = ((hi & 0xff) << 8) | (lo & 0xff);
	return v & 0x8000 ? v - 0x10000 : v;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export class MouseCard implements ISlotCard {
	private registers!: DataView;

	// Mouse State (position in mouse units, inside the clamping window)
	private x = 0;
	private y = 0;
	private lastButton0 = false;
	private button0 = false;
	// Position at the last READMOUSE / SERVEMOUSE, for the "moved" status bit
	private lastReadX = 0;
	private lastReadY = 0;

	// Last host position seen (units, 0..MOUSE_HOST_RANGE-1); null: resync on the next tick (not part of a snapshot)
	private hostX: number | null = null;
	private hostY: number | null = null;

	// Clamping window (CLAMPMOUSE), signed 16-bit
	private minX = DEFAULT_MIN;
	private maxX = DEFAULT_MAX;
	private minY = DEFAULT_MIN;
	private maxY = DEFAULT_MAX;

	// Bit 	  0 : Turn mouse on
	//		  1 : Enable interrupts on mouse movement
	// 		  2 : Enable interrupts when button pressed
	// 		  3 : Enable interrupts every screen refresh
	// Bits	4-7 : Reserved
	private mode = 0;

	public snapshot() {
		const { x, y, lastButton0, button0, lastReadX, lastReadY, minX, maxX, minY, maxY, mode } = this;
		return { x, y, lastButton0, button0, lastReadX, lastReadY, minX, maxX, minY, maxY, mode };
	}

	public restoreSnapshot(state: unknown) {
		Object.assign(this, state as ReturnType<MouseCard["snapshot"]>);
		// The host mouse has moved on since: take its current position as the new reference
		this.hostX = null;
		this.hostY = null;
	}

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

	tick?(_cycles: number): void {
		// Mouse axes: analog inputs 2 & 3 (offsets +8 & +12)
		const mx = this.registers.getFloat32(INPUT_ANALOG_0_OFFSET + 8, true);
		const my = this.registers.getFloat32(INPUT_ANALOG_0_OFFSET + 12, true);
		// Mouse buttons: digital inputs 4 & 5 (0-3 are the game port pushbuttons PB0-PB3, read by the bus)
		const digital1 = this.registers.getUint8(INPUT_DIGITAL_OFFSET);
		const mb0 = (digital1 & 0b0001_0000) !== 0;
		const mb1 = (digital1 & 0b0010_0000) !== 0;
		this.setHostMouse(mx * MOUSE_HOST_RANGE, my * MOUSE_HOST_RANGE, mb0, mb1);
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
		this.minX = DEFAULT_MIN;
		this.maxX = DEFAULT_MAX;
		this.minY = DEFAULT_MIN;
		this.maxY = DEFAULT_MAX;
		this.x = 0;
		this.y = 0;
		this.lastReadX = 0;
		this.lastReadY = 0;
		this.mode = 0;
		this.registers?.setUint8(REG_A_OFFSET, 0);
		this.clearCarry();
	}

	/** Puts the mouse at the top-left corner of the clamping window. */
	private cmdHomeMouse() {
		this.x = this.minX;
		this.y = this.minY;
		this.clearCarry();
	}

	private cmdReadMouse() {
		this.updateScreenHoles();
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

	/** Puts the mouse at 0,0 (clamped to the window). */
	private cmdClearMouse() {
		this.x = clamp(0, this.minX, this.maxX);
		this.y = clamp(0, this.minY, this.maxY);
		this.clearCarry();
	}

	/** Puts the mouse at the position in the card's screen holes ($0478+n / $0578+n for X, $04F8+n / $05F8+n for Y). */
	private cmdPosMouse() {
		const n = this.slot;
		const x = toInt16(this.bus.read(HOLE_X_LO + n), this.bus.read(HOLE_X_HI + n));
		const y = toInt16(this.bus.read(HOLE_Y_LO + n), this.bus.read(HOLE_Y_HI + n));
		this.x = clamp(x, this.minX, this.maxX);
		this.y = clamp(y, this.minY, this.maxY);
		this.clearCarry();
	}

	/**
	 * A = 0: X, 1: Y. The new bounds are in slot 0's screen holes: minimum in $0478 (low) / $0578 (high),
	 * maximum in $04F8 (low) / $05F8 (high). The current position is brought inside the new window.
	 */
	private cmdClampMouse() {
		const min = toInt16(this.bus.read(HOLE_X_LO), this.bus.read(HOLE_X_HI));
		const max = toInt16(this.bus.read(HOLE_Y_LO), this.bus.read(HOLE_Y_HI));
		if (this.registers.getUint8(REG_A_OFFSET) & 1) {
			this.minY = min;
			this.maxY = max;
			this.y = clamp(this.y, min, max);
		} else {
			this.minX = min;
			this.maxX = max;
			this.x = clamp(this.x, min, max);
		}
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

		const n = this.slot;
		const x = Math.trunc(this.x) & 0xffff;
		const y = Math.trunc(this.y) & 0xffff;

		this.bus.write(HOLE_X_LO + n, x & 0xff);
		this.bus.write(HOLE_X_HI + n, x >> 8);
		this.bus.write(HOLE_Y_LO + n, y & 0xff);
		this.bus.write(HOLE_Y_HI + n, y >> 8);

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
		if (x !== this.lastReadX || y !== this.lastReadY) status |= 0x20;
		this.bus.write(HOLE_STATUS + n, status);

		this.lastButton0 = this.button0;
		this.lastReadX = x;
		this.lastReadY = y;

		this.bus.write(HOLE_MODE + n, this.mode);
	}

	private clearCarry() {
		if (!this.registers) return;
		const status = this.registers.getUint8(REG_STATUS_OFFSET);
		this.registers.setUint8(REG_STATUS_OFFSET, status & ~FLAG_C_MASK);
	}

	/** The host's movement since the last tick, across the wrap at MOUSE_HOST_RANGE. */
	private static hostDelta(from: number, to: number) {
		let d = to - from;
		if (d > MOUSE_HOST_RANGE / 2) d -= MOUSE_HOST_RANGE;
		else if (d < -MOUSE_HOST_RANGE / 2) d += MOUSE_HOST_RANGE;
		return d;
	}

	// --- Public Interface for Host ---

	/** The host mouse: its (wrapping) position in units and its buttons. Moves the card's mouse by the difference. */
	public setHostMouse(hostX: number, hostY: number, button0: boolean, _button1: boolean) {
		if (Number.isFinite(hostX) && Number.isFinite(hostY)) {
			if (this.hostX !== null && this.hostY !== null) {
				this.x = clamp(this.x + MouseCard.hostDelta(this.hostX, hostX), this.minX, this.maxX);
				this.y = clamp(this.y + MouseCard.hostDelta(this.hostY, hostY), this.minY, this.maxY);
			}
			this.hostX = hostX;
			this.hostY = hostY;
		}
		this.button0 = button0;
	}
}
