import type { IBus } from "@/cpu/bus.interface";
import { FLAG_C_MASK, REG_A_OFFSET, REG_STATUS_OFFSET, REG_X_OFFSET, REG_Y_OFFSET } from "@/cpu/shared-memory";
import type { ISlotCard } from "./slotcard.interface";

export class SmartPortCard implements ISlotCard {
	private rom: Uint8Array;
	private expansionRom = new Uint8Array(2048);
	private bus?: IBus;
	private registers?: DataView;
	private slot: number;
	private diskData: Uint8Array | null = null;

	constructor(slot: number, rom: Uint8Array) {
		this.slot = slot;
		this.rom = rom;
		this.initRom();
	}

	public insertMedia(data: Uint8Array) {
		this.diskData = data;
	}

	private initRom() {
		// --- SmartPort Identification ---
		// The OS scans slots for these bytes to identify SmartPort devices.
		// $Cn01 = $20
		// $Cn03 = $00
		// $Cn05 = $03
		// $Cn07 = $00
		// Note: We construct a JMP instruction at $00 that happens to put $20 at $01.

		// $00: JMP $Cn20 (Boot Routine)
		// Opcode 4C 20 Cn -> $01 becomes $20, satisfying the ID check.
		this.rom[0x00] = 0x4c; // JMP Absolute
		this.rom[0x01] = 0x20; // Lo Byte ($20) - Matches ID Byte
		this.rom[0x02] = 0xc0 + this.slot; // Hi Byte ($Cn)

		this.rom[0x03] = 0x00; // ID Byte
		this.rom[0x05] = 0x03; // ID Byte
		this.rom[0x07] = 0x00; // ID Byte

		this.rom[0xff] = 0x0a; // ID Byte

		// --- HLE Trigger ($Cn40) ---
		const ioBase = 0xc080 + (this.slot << 4);
		const ioLo = ioBase & 0xff;
		const ioHi = ioBase >> 8;

		this.rom[0x40] = 0x8d; // STA Absolute
		this.rom[0x41] = ioLo;
		this.rom[0x42] = ioHi;
		this.rom[0x43] = 0x18; // CLC
		this.rom[0x44] = 0x60; // RTS

		// --- SmartPort Dispatcher ($Cn0A) ---
		this.rom[0x0a] = 0x4c; // JMP $Cn40
		this.rom[0x0b] = 0x40;
		this.rom[0x0c] = 0xc0 + this.slot;

		// --- Boot Routine ($Cn20) ---
		// 1. Setup Params at $42 for Block 0 Read to $0800
		let addr = 0x20;
		const write = (byte: number) => {
			this.rom[addr++] = byte;
		};

		// STZ $44 (Buf Lo)
		write(0x64);
		write(0x44);
		// STZ $46 (Blk Lo)
		write(0x64);
		write(0x46);
		// STZ $47 (Blk Hi)
		write(0x64);
		write(0x47);

		// LDA #$08
		write(0xa9);
		write(0x08);
		// STA $45 (Buf Hi)
		write(0x85);
		write(0x45);

		// LDA #$01 (Command: READ)
		write(0xa9);
		write(0x01);
		// STA $42 (Command Code)
		write(0x85);
		write(0x42);

		// LDX #$42
		write(0xa2);
		write(0x42);

		// LDY #$00
		write(0xa0);
		write(0x00);

		// JSR $Cn0A (Call Dispatcher)
		write(0x20);
		write(0x0a);
		write(0xc0 + this.slot);

		// BCS Error (RTS)
		write(0xb0);
		write(0x03);

		// LDX #$42 (ProDOS ZP Param Lo)
		write(0xa2);
		write(this.slot * 0x10);

		// JMP $0801 (Jump to Boot Sector)
		write(0x4c);
		write(0x01);
		write(0x08);
		// RTS (Error return)
		write(0x60);
	}

	setRegisters(view: DataView) {
		this.registers = view;
	}

	setBus(bus: IBus) {
		this.bus = bus;
	}

	readRom(offset: number): number {
		return this.rom[offset] ?? 0;
	}

	readExpansion(offset: number): number {
		return this.expansionRom[offset] ?? 0;
	}

	readIo(_offset: number): number {
		return 0;
	}

	writeIo(offset: number, _value: number): void {
		// We use offset 0 as the trigger from our ROM trampoline
		if (offset === 0) this.handleHleCommand();
	}

	private handleHleCommand() {
		if (!this.registers || !this.bus) return;

		// Read CPU State
		const cmd = this.bus.read(0x42);
		const paramAddr = 0x42;

		console.log(`SmartPort HLE: Slot ${this.slot} Cmd: ${cmd} ParamAddr: $${paramAddr.toString(16)}`);

		let error = 0;

		switch (cmd) {
			case 0x00: // STATUS
				error = this.handleStatus(paramAddr);
				break;
			case 0x01: // READ
				error = this.handleRead(paramAddr);
				break;
			case 0x02: // WRITE
				error = 0x2b; // Write Protected
				break;
			default:
				error = 0x01; // Bad Command
				break;
		}

		// Update CPU State for return
		if (error) {
			this.registers.setUint8(REG_A_OFFSET, error);
			const status = this.registers.getUint8(REG_STATUS_OFFSET) | FLAG_C_MASK; // Set Carry
			this.registers.setUint8(REG_STATUS_OFFSET, status);
		} else {
			this.registers.setUint8(REG_A_OFFSET, 0);
			const status = this.registers.getUint8(REG_STATUS_OFFSET) & ~FLAG_C_MASK; // Clear Carry
			this.registers.setUint8(REG_STATUS_OFFSET, status);
		}
	}

	private handleStatus(_paramAddr: number): number {
		if (!this.diskData) return 0x2f; // Device Offline

		// ProDOS Status: Returns block count in X (Lo) and Y (Hi)
		const blocks = Math.floor(this.diskData.length / 512);
		this.registers?.setUint8(REG_X_OFFSET, blocks & 0xff);
		this.registers?.setUint8(REG_Y_OFFSET, (blocks >> 8) & 0xff);

		return 0;
	}

	private handleRead(paramAddr: number): number {
		if (!this.bus || !this.diskData) return 0x2f; // Device Offline

		// ProDOS Block Device Parameters (at ZP $42 usually)
		// +1: Unit Number (ignored for now)
		// +2: Buffer Pointer Lo
		// +3: Buffer Pointer Hi
		const bufLo = this.bus.read(paramAddr + 2);
		const bufHi = this.bus.read(paramAddr + 3);
		const bufferAddr = (bufHi << 8) | bufLo;

		// +4: Block Number Lo
		// +5: Block Number Hi
		const blkLo = this.bus.read(paramAddr + 4);
		const blkHi = this.bus.read(paramAddr + 5);
		const block = (blkHi << 8) | blkLo;

		const offset = block * 512;
		if (offset + 512 > this.diskData.length) return 0x27; // I/O Error

		for (let i = 0; i < 512; i++) this.bus.write(bufferAddr + i, this.diskData[offset + i] ?? 0);

		return 0;
	}
}
