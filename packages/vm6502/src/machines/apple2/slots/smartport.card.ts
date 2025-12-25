import type { IBus } from "@/virtualmachine/cpu/bus.interface";
import {
	FLAG_C_MASK,
	REG_A_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
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

		// 7.....10 : bit7=extended; bit1=SCSI; bit0=RAMCard
		this.rom[0xfb] = 0x00; // SP ID type

		this.rom[0xfc] = 0x00; // block count
		this.rom[0xfd] = 0x00; //
		this.rom[0xfe] = 0xff; // device info flags
		this.rom[0xff] = 0x0a; // Lo MLI ENtrypoint

		// --- HLE Trigger 1: Registers ($Cn40) ---
		const ioBase = 0xc080 + (this.slot << 4);
		const ioLo = ioBase & 0xff;
		const ioHi = ioBase >> 8;

		this.rom[0x40] = 0x8d; // STA Absolute
		this.rom[0x41] = ioLo;
		this.rom[0x42] = ioHi;
		// this.rom[0x43] = 0x18; // CLC
		this.rom[0x43] = 0x60; // RTS

		// --- HLE Trigger 2: Inline ($Cn44) ---
		this.rom[0x44] = 0x8d; // STA Absolute
		this.rom[0x45] = ioLo + 1; // Offset 1 triggers Inline handler
		this.rom[0x46] = ioHi;
		this.rom[0x47] = 0x60; // RTS

		// --- SmartPort ProDOS Block-level Interface ($Cn0A) ---
		this.rom[0x0a] = 0x4c; // JMP $Cn40
		this.rom[0x0b] = 0x40;
		this.rom[0x0c] = 0xc0 + this.slot;

		// --- SmartPort MLI ($Cn0D) ---
		/**
		 SP_CALL	jsr $Cn0D		;Call SmartPort command dispatcher
		 			.db CMDNUM		;This specifies the command type
					.dw CMDLIST
					bcs ERROR
		 */
		this.rom[0x0d] = 0x4c; // JMP $Cn44
		this.rom[0x0e] = 0x44;
		this.rom[0x0f] = 0xc0 + this.slot;

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
		if (offset === 0) this.handleBlockCommand();
		if (offset === 1) this.handleSmartPortCommand();
	}

	// Handle Standard Block Device call (zp addresses)
	private handleBlockCommand() {
		if (!this.registers || !this.bus) return;

		const cmd = this.bus.read(0x42);
		const paramAddr = 0x42;
		// const cmd = this.registers.getUint8(REG_A_OFFSET);
		// const paramLo = this.registers.getUint8(REG_X_OFFSET);
		// const paramHi = this.registers.getUint8(REG_Y_OFFSET);
		// const paramAddr = (paramHi << 8) | paramLo;

		this.executeCommand(cmd, paramAddr, false);
	}

	// Handle SmartPort MLI call (Inline)
	private handleSmartPortCommand() {
		if (!this.registers || !this.bus) return;

		// 1. Get Return Address from Stack
		const sp = this.registers.getUint8(REG_SP_OFFSET);
		const stackBase = 0x100;
		// Stack contains Return Address - 1 (pointing to last byte of JSR)
		const retLo = this.bus.read(stackBase + sp + 1);
		const retHi = this.bus.read(stackBase + sp + 2);
		const retAddr = (retHi << 8) | retLo;

		// 2. Read Inline Parameters (following JSR)
		// JSR is 3 bytes. retAddr points to 3rd byte.
		// Data starts at retAddr + 1.
		const cmd = this.bus.read(retAddr + 1);
		const paramLo = this.bus.read(retAddr + 2);
		const paramHi = this.bus.read(retAddr + 3);
		const paramAddr = (paramHi << 8) | paramLo;

		// 3. Execute
		this.executeCommand(cmd, paramAddr, true);

		// 4. Fix Stack to skip inline data
		// We consumed 3 bytes (Cmd, Lo, Hi).
		// New return address should be retAddr + 3.
		const newRet = retAddr + 3;
		this.bus.write(stackBase + sp + 1, newRet & 0xff);
		this.bus.write(stackBase + sp + 2, (newRet >> 8) & 0xff);
	}

	private executeCommand(cmd: number, paramAddr: number, isSmartPort: boolean) {
		if (!this.registers) return;
		console.log(`SmartPort(${this.slot}) Cmd: ${cmd.toString(16)} ParamAddr: $${paramAddr.toString(16)}`);

		let error = 0;

		switch (cmd) {
			case 0x00: // STATUS
				if (isSmartPort) error = this.handleSmartPortStatus(paramAddr);
				else error = this.handleBlockStatus(paramAddr);
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

	private handleBlockStatus(_paramAddr: number): number {
		if (!this.diskData) return 0x2f; // Device Offline

		// ProDOS Status: Returns block count in X (Lo) and Y (Hi)
		const blocks = Math.floor(this.diskData.length / 512);
		this.registers?.setUint8(REG_X_OFFSET, blocks & 0xff);
		this.registers?.setUint8(REG_Y_OFFSET, (blocks >> 8) & 0xff);

		return 0;
	}

	private handleSmartPortStatus(paramAddr: number): number {
		if (!this.bus || !this.diskData) return 0x2f; // Device Offline

		// Param List: [Count, Unit, PtrLo, PtrHi, Code]
		const listPtrLo = this.bus.read(paramAddr + 2);
		const listPtrHi = this.bus.read(paramAddr + 3);
		const listPtr = (listPtrHi << 8) | listPtrLo;
		const code = this.bus.read(paramAddr + 4);

		switch (code) {
			case 0x00: {
				// Device Status
				// Byte 0: Status (0x86 = Active, R/W, Format Allowed)
				this.bus.write(listPtr, 0b1111_1000);

				const blocks = Math.floor(this.diskData.length / 512);
				// Byte 1-3: Blocks
				this.bus.write(listPtr + 1, blocks & 0xff);
				this.bus.write(listPtr + 2, (blocks >> 8) & 0xff);
				this.bus.write(listPtr + 3, (blocks >> 16) & 0xff);
				break;
			}
			case 0x01: // Device Control Block (DCB)
				// TODO: Implement DCB if required
				break;
			case 0x02: // Newline Status
				// TODO: Implement Newline if required (Character devices)
				break;
			case 0x03: {
				// Device Info Block (DIB)
				// Byte 0: Device Type (0x02 = Hard Disk)
				// Byte 1: Subtype (0x20)
				// Byte 2-3: Version (0x0100)
				// Byte 4: Caps (0x03 = Read/Write)
				// Byte 5: Name Len (16)
				// Byte 6..21: "SmartPort Drive "
				this.bus.write(listPtr + 0, 0x02);
				this.bus.write(listPtr + 1, 0x20);
				this.bus.write(listPtr + 2, 0x00);
				this.bus.write(listPtr + 3, 0x01);
				this.bus.write(listPtr + 4, 0x03);
				const name = "SmartPort Drive ";
				this.bus.write(listPtr + 5, name.length);
				for (let i = 0; i < name.length; i++) this.bus.write(listPtr + 6 + i, name.charCodeAt(i));
				break;
			}
			default:
				return 0x21; // Bad Code
		}
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

		console.log(`SmartPort Read - block: ${block} addr: $${bufferAddr.toString(16)}`);

		const offset = block * 512;
		if (offset + 512 > this.diskData.length) return 0x27; // I/O Error

		for (let i = 0; i < 512; i++) this.bus.write(bufferAddr + i, this.diskData[offset + i] ?? 0);

		return 0;
	}
}
