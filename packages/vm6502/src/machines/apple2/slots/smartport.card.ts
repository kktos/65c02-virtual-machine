import { toBlockOrder } from "@/lib/disk/formats/apple2/analyzeDisk";
import { PHYS_TO_PRODOS } from "@/lib/disk/formats/apple2/diskImage";
import type { IBus } from "@/types/bus.interface";
import {
	FLAG_C_MASK,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import type { ISlotCard } from "./slotcard.interface";
import { absoluteInstructionLength, findRwtsCall, type IobResult, serveIob } from "./smartport.rwts";

/** Where the ROM stubs are: a patched RWTS entry calls RWTS_HLE, the detour of the call in progress RWTS_RESUME. */
const RWTS_HLE = 0x90;
const RWTS_RESUME = 0x94;
/** The Disk II data latch: $C08C,X */
const DISK2_DATA_LATCH = 0x0c;

const hex = (value: number, pad: number) => value.toString(16).toUpperCase().padStart(pad, "0");

export class SmartPortCard implements ISlotCard {
	private expansionRom = new Uint8Array(2048);
	private registers?: DataView;
	private diskData: Uint8Array | null = null;
	public loggingEnabled = false;
	/** The RWTS call in progress, sent to RWTS_RESUME by `detourRwts`: the bytes the JMP replaced, its frame. */
	private detour: { at: number; saved: number[]; frame: number; iob: number } | null = null;
	/** The PCs of Disk II code already reported as not a DOS 3.3 RWTS */
	private unknownLoaders = new Set<number>();

	constructor(
		private bus: IBus,
		public slot: number,
		private rom: Uint8Array,
	) {
		this.initRom();
	}

	/**
	 * Blocks are read as 512-byte runs of the image, so it is kept in ProDOS order: a .2mg header stripped
	 * (https://gswv.apple2.org.za/a2zine/Docs/DiskImage_2MG_Info.txt), a DOS-order floppy (most .dsk) reordered.
	 * `metadata.name`: the file name, whose extension tells the order.
	 */
	public insertMedia(data: Uint8Array, metadata?: Record<string, unknown>) {
		this.diskData = toBlockOrder(data, String(metadata?.name ?? ""));
	}

	/**
	 * The disk in the drive. Shared, not copied: the card only reads it, and a new disk is a new array.
	 * (If writes are ever supported, they must copy it first when a snapshot holds it.)
	 */
	public snapshot() {
		return { diskData: this.diskData };
	}

	public restoreSnapshot(state: unknown) {
		this.diskData = (state as ReturnType<SmartPortCard["snapshot"]>).diskData;
	}

	/** No disk: calls answer "no device" ($2F) and the boot code resumes the slot scan. */
	public ejectMedia() {
		this.diskData = null;
	}

	private initRom() {
		const n = this.slot;
		const cn = 0xc0 + n;
		const ioBase = 0xc080 + (n << 4);
		const io = (offset: number) => [(ioBase + offset) & 0xff, ioBase >> 8];

		// Writes the bytes at `offset`, refusing to overlap a routine already there.
		const used = new Set<number>();
		const at = (offset: number, bytes: number[]) => {
			bytes.forEach((byte, i) => {
				if (used.has(offset + i)) throw new Error(`SmartPort ROM: $${(offset + i).toString(16)} written twice`);
				used.add(offset + i);
				this.rom[offset + i] = byte;
			});
			return offset + bytes.length;
		};
		const branch = (from: number, to: number) => (to - (from + 2)) & 0xff;

		const BOOT = 0x20;
		const READ_SECTOR = 0x5c; // Disk II ROM ReadSector: DOS 3.3 BOOT1 calls it, through ($3E)
		const READ_SECTOR_NEXT = READ_SECTOR + 5; // after STA $C0n2 / BCS
		const BLOCK_HLE = 0x70;
		const SMARTPORT_HLE = 0x74;
		const BOOT_ERROR = 0x78;

		// --- SmartPort Identification ---
		// The OS scans slots for $Cn01 = $20, $Cn03 = $00, $Cn05 = $03, $Cn07 = $00 (a Disk II has $3C there).
		// $00: JMP $Cn20 (boot), whose operand puts $20 at $01.
		at(0x00, [0x4c, BOOT, cn]);
		at(0x03, [0x00]);
		at(0x05, [0x03]);
		at(0x07, [0x00]);

		// --- ProDOS block-level interface ($Cn0A) and SmartPort dispatcher ($Cn0D) ---
		//  SP_CALL jsr $Cn0D / .db CMDNUM / .dw CMDLIST / bcs ERROR
		at(0x0a, [0x4c, BLOCK_HLE, cn]);
		at(0x0d, [0x4c, SMARTPORT_HLE, cn]);

		// --- HLE triggers: a write to the card's I/O, then RTS with the result in A and C ---
		at(BLOCK_HLE, [0x8d, ...io(0), 0x60]); // STA $C0n0 / RTS: params at $42
		at(SMARTPORT_HLE, [0x8d, ...io(1), 0x60]); // STA $C0n1 / RTS: inline params
		at(RWTS_HLE, [0x8d, ...io(3), 0x60]); // STA $C0n3 / RTS: a patched RWTS entry, the IOB in A/Y
		at(RWTS_RESUME, [0x8d, ...io(4), 0x60]); // STA $C0n4 / RTS: the RWTS call caught in progress

		// 7.....10 : bit7=extended; bit1=SCSI; bit0=RAMCard
		at(0xfb, [0x00]); // SP ID type
		at(0xfc, [0x00, 0x00]); // block count: ask STATUS
		at(0xfe, [0xff]); // device info flags
		at(0xff, [0x0a]); // block-level interface entry point: $Cn0A ($00 would mean a Disk II)

		// --- Boot ($Cn20): READ block 0 to $0800, then enter $0801 as the Disk II ROM does ---
		let addr = at(BOOT, [
			0x64, 0x44, // STZ $44   buffer lo
			0x64, 0x46, // STZ $46   block lo
			0x64, 0x47, // STZ $47   block hi
			0xa9, 0x08, // LDA #$08
			0x85, 0x45, // STA $45   buffer hi
			0xa9, n << 4, // LDA #$n0
			0x85, 0x43, // STA $43   unit: slot n, drive 1
			0xa9, 0x01, // LDA #$01  READ
			0x85, 0x42, // STA $42
			0xa2, 0x42, // LDX #$42
			0xa0, 0x00, // LDY #$00
			0x20, 0x0a, cn, // JSR $Cn0A
		]);
		addr = at(addr, [0xb0, branch(addr, BOOT_ERROR)]); // BCS BootError
		// The zero page the Disk II ROM leaves after reading sector 0 (a DOS 3.3 BOOT1 relies on it):
		// data_ptr $26/$27 = $0900, sector $3D = 1, track $41 = 0, slot_index $2B = $n0.
		// Then on to the ROM's "more sectors?" test, which ends in JMP $0801 with X = $n0.
		at(addr, [
			0x64, 0x26, // STZ $26
			0x64, 0x41, // STZ $41
			0xa9, 0x09, // LDA #$09
			0x85, 0x27, // STA $27
			0xa9, 0x01, // LDA #$01
			0x85, 0x3d, // STA $3D
			0xa2, n << 4, // LDX #$n0
			0x86, 0x2b, // STX $2B
			0x4c, READ_SECTOR_NEXT, cn, // JMP ReadSectorNext
		]);

		// --- ReadSector ($Cn5C), as the Disk II ROM's ---
		// In: track $41, physical sector $3D, buffer ($26), slot_index $2B. Reads that sector,
		// INC $27 / INC $3D, and again while $3D < [$0800]; then LDX $2B / JMP $0801.
		// A sector the image doesn't have (a real Disk II would search forever): the boot failed.
		addr = at(READ_SECTOR, [0x8d, ...io(2)]); // STA $C0n2: read the sector, INC $27 / $3D; C = error
		addr = at(addr, [0xb0, branch(addr, BOOT_ERROR)]); // BCS BootError
		// ReadSectorNext: where the boot joins, sector 0 being already in $0800
		addr = at(READ_SECTOR_NEXT, [
			0xa5, 0x3d, // LDA $3D
			0xcd, 0x00, 0x08, // CMP $0800
			0xa6, 0x2b, // LDX $2B
		]);
		addr = at(addr, [0x90, branch(addr, READ_SECTOR)]); // BCC ReadSector
		at(addr, [0x4c, 0x01, 0x08]); // JMP $0801

		// --- Boot error ---
		// The autostart ROM enters with JMP ($0000), not JSR: there is nothing to return to.
		// Like real boot ROMs: if called by the slot scan ($00/$01 = $Cn00), resume it at SLOOP ($FABA),
		// which tries the next slots and ends in BASIC; otherwise (PR#n, CnnnG) cold-start BASIC.
		at(BOOT_ERROR, [
			0xa5, 0x00, // LDA $00
			0xd0, 0x09, // BNE Basic
			0xa5, 0x01, // LDA $01
			0xc9, cn, // CMP #$Cn
			0xd0, 0x03, // BNE Basic
			0x4c, 0xba, 0xfa, // JMP $FABA  SLOOP: continue the slot scan
			0x4c, 0x00, 0xe0, // Basic: JMP $E000
		]);
	}

	setRegisters(view: DataView) {
		this.registers = view;
	}

	public setDebugOverrides(overrides: { diskLogging?: boolean }) {
		if (typeof overrides.diskLogging === "boolean") this.loggingEnabled = overrides.diskLogging;
	}

	readRom(offset: number): number {
		return this.rom[offset] ?? 0;
	}

	readExpansion(offset: number): number {
		return this.expansionRom[offset] ?? 0;
	}

	readIo(offset: number): number {
		if (offset === DISK2_DATA_LATCH) this.detourRwts();
		return 0;
	}

	writeIo(offset: number, _value: number): void {
		if (offset === 0) this.handleBlockCommand();
		if (offset === 1) this.handleSmartPortCommand();
		if (offset === 2) this.handleReadSector();
		if (offset === 3) this.handleRwtsCall();
		if (offset === 4) this.resumeRwtsCall();
	}

	/**
	 * Code reading the Disk II data latch: a RWTS (see smartport.rwts.ts). If it is a DOS 3.3-like one, its
	 * entry becomes JMP RWTS_HLE for the next calls; and the call in progress is served by a detour: the
	 * instruction after this one (the CPU finishes this one) becomes JMP RWTS_RESUME, put back once there.
	 */
	private detourRwts() {
		if (!this.registers || this.detour) return;
		const bus = this.bus;
		const pc = this.registers.getUint16(REG_PC_OFFSET, true); // the instruction reading the latch
		if (pc >= 0xc000) return;
		const call = findRwtsCall(bus, this.registers.getUint8(REG_SP_OFFSET));
		const length = absoluteInstructionLength(bus.read(pc));
		if (!call || !length) {
			if (!this.unknownLoaders.has(pc)) {
				this.unknownLoaders.add(pc);
				console.warn(`SmartPort(${this.slot}): Disk II code at $${hex(pc, 4)}, not a DOS 3.3 RWTS call`);
			}
			return;
		}

		// Both patches must land where the code is read from (not hidden by a bank switched for writing)
		const patch = (address: number, bytes: number[]) => {
			const saved = bytes.map((_, i) => bus.read(address + i));
			bytes.forEach((byte, i) => bus.write(address + i, byte));
			if (bytes.every((byte, i) => bus.read(address + i) === byte)) return saved;
			saved.forEach((byte, i) => bus.write(address + i, byte));
			return null;
		};
		const cn = 0xc0 + this.slot;
		const at = pc + length;
		const saved = patch(at, [0x4c, RWTS_RESUME, cn]);
		if (!saved) return;
		if (!patch(call.entry, [0x4c, RWTS_HLE, cn])) {
			patch(at, saved);
			return;
		}
		this.detour = { at, saved, frame: call.frame, iob: call.iob };
		console.info(
			`SmartPort(${this.slot}): RWTS at $${hex(call.entry, 4)} (IOB $${hex(call.iob, 4)}) now calls $${hex(cn, 2)}${hex(RWTS_HLE, 2)}`,
		);
	}

	/** RWTS_RESUME: the call caught by `detourRwts`, served; then the stub's RTS returns to its caller. */
	private resumeRwtsCall() {
		const detour = this.detour;
		if (!this.registers || !detour) return;
		this.detour = null;
		detour.saved.forEach((byte, i) => this.bus.write(detour.at + i, byte));
		this.registers.setUint8(REG_SP_OFFSET, detour.frame - 1);
		this.returnRwts(serveIob(this.bus, detour.iob, this.diskData, this.slot));
	}

	/** RWTS_HLE: a patched RWTS entry. Like the entry, keeps the IOB address (Y lo, A hi) at $48/$49. */
	private handleRwtsCall() {
		if (!this.registers) return;
		const lo = this.registers.getUint8(REG_Y_OFFSET);
		const hi = this.registers.getUint8(REG_A_OFFSET);
		this.bus.write(0x48, lo);
		this.bus.write(0x49, hi);
		this.returnRwts(serveIob(this.bus, (hi << 8) | lo, this.diskData, this.slot));
	}

	/** As RWTS returns: the error code in A, carry set on an error. */
	private returnRwts(result: IobResult) {
		if (!this.registers) return;
		if (this.loggingEnabled && result.offset >= 0) {
			postMessage({
				type: "log",
				channel: "disk",
				text: `RWTS READ track=$${hex(result.track, 2)} sector=$${hex(result.sector, 2)} address=$${hex(result.buffer, 4)}`,
				payload: { name: "SP51", type: "READ", block: result.offset >> 9, address: result.buffer },
			});
		}
		this.registers.setUint8(REG_A_OFFSET, result.error);
		const status = this.registers.getUint8(REG_STATUS_OFFSET);
		this.registers.setUint8(REG_STATUS_OFFSET, result.error ? status | FLAG_C_MASK : status & ~FLAG_C_MASK);
	}

	/**
	 * The Disk II ROM's ReadSector ($Cn5C), for a DOS 3.3 BOOT1 (or any boot code) calling it:
	 * physical sector $3D of track $41 into ($26), then INC $27 and INC $3D. Carry set if the image
	 * hasn't that sector. The image being in ProDOS order, track t sector s is at
	 * (t * 16 + PHYS_TO_PRODOS[s]) * 256 (on a bigger image, the same as if it had 16-sector tracks).
	 */
	private handleReadSector() {
		if (!this.registers) return;
		const bus = this.bus;
		const track = bus.read(0x41);
		const sector = bus.read(0x3d);
		const buffer = (bus.read(0x27) << 8) | bus.read(0x26);
		const prodosSector = PHYS_TO_PRODOS[sector];
		const offset = prodosSector === undefined ? -1 : (track * 16 + prodosSector) * 256;
		const ok = !!this.diskData && offset >= 0 && offset + 256 <= this.diskData.length;

		// Logged when read: the disk map draws the block the sector is in
		if (this.loggingEnabled && ok) {
			postMessage({
				type: "log",
				channel: "disk",
				text: `READ track=$${hex(track, 2)} sector=$${hex(sector, 2)} address=$${hex(buffer, 4)}`,
				payload: { name: "SP51", type: "READ", block: offset >> 9, track, sector, address: buffer },
			});
		}

		let status = this.registers.getUint8(REG_STATUS_OFFSET);
		if (ok) {
			for (let i = 0; i < 256; i++) bus.write((buffer + i) & 0xffff, this.diskData?.[offset + i] ?? 0);
			bus.write(0x27, (bus.read(0x27) + 1) & 0xff);
			bus.write(0x3d, (sector + 1) & 0xff);
			status &= ~FLAG_C_MASK;
		} else status |= FLAG_C_MASK;
		this.registers.setUint8(REG_STATUS_OFFSET, status);
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

		let error = 0;

		switch (cmd) {
			case 0x00: // STATUS
				if (isSmartPort) error = this.handleSmartPortStatus(paramAddr);
				else error = this.handleBlockStatus(paramAddr);
				break;
			case 0x01: // READ
				error = this.unitError(paramAddr, isSmartPort) || this.handleRead(paramAddr);
				break;
			case 0x02: // WRITE
				error = this.unitError(paramAddr, isSmartPort) || 0x2b; // Write Protected
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

	/**
	 * The card has one drive. SmartPort: unit 1 (unit 0 is the host itself, for STATUS only).
	 * ProDOS block interface: unit number DSSS0000, drive 1 (D = 0). Anything else: no device ($28).
	 */
	private unitError(paramAddr: number, isSmartPort: boolean): number {
		const unit = this.bus.read(paramAddr + 1);
		const ok = isSmartPort ? unit === 1 : !(unit & 0x80);
		return ok ? 0 : 0x28;
	}

	private handleBlockStatus(paramAddr: number): number {
		const unitError = this.unitError(paramAddr, false);
		if (unitError) return unitError;
		if (!this.diskData) return 0x2f; // Device Offline

		// ProDOS Status: Returns block count in X (Lo) and Y (Hi)
		const blocks = Math.floor(this.diskData.length / 512);
		this.registers?.setUint8(REG_X_OFFSET, blocks & 0xff);
		this.registers?.setUint8(REG_Y_OFFSET, (blocks >> 8) & 0xff);

		return 0;
	}

	/**
	 * SmartPort STATUS. Params: [count, unit, list lo, list hi, code]. Returns the bytes written in X/Y.
	 * Unit 0 is the host: code 0 tells how many devices it has (ProDOS 2.x mirrors units 3+ into other
	 * slots, so a wrong count there shows the same disk many times). Unit 1 is the drive.
	 */
	private handleSmartPortStatus(paramAddr: number): number {
		const bus = this.bus;
		const unit = bus.read(paramAddr + 1);
		const listPtr = (bus.read(paramAddr + 3) << 8) | bus.read(paramAddr + 2);
		const code = bus.read(paramAddr + 4);
		const write = (bytes: number[]) => {
			bytes.forEach((byte, i) => bus.write((listPtr + i) & 0xffff, byte));
			this.registers?.setUint8(REG_X_OFFSET, bytes.length & 0xff);
			this.registers?.setUint8(REG_Y_OFFSET, bytes.length >> 8);
			return 0;
		};

		if (unit === 0) {
			// Host status: number of devices, interrupt status ($40: none), 6 reserved bytes
			if (code !== 0x00) return 0x21; // Bad Code
			return write([1, 0x40, 0, 0, 0, 0, 0, 0]);
		}
		if (unit !== 1) return 0x28; // No Device Connected
		if (!this.diskData) return 0x2f; // Device Offline

		// General status: block device, write allowed, read allowed, online, format allowed,
		// write protected (WRITE answers $2B)
		const blocks = Math.floor(this.diskData.length / 512);
		const status = [0b1111_1100, blocks & 0xff, (blocks >> 8) & 0xff, (blocks >> 16) & 0xff];

		switch (code) {
			case 0x00: // Device Status
				return write(status);
			case 0x01: // Device Control Block: none (a count byte of 0)
				return write([0]);
			case 0x03: {
				// Device Info Block: status (4), ID string length, ID string (16, upper case, space padded),
				// device type ($02: hard disk), subtype, firmware version (2)
				const name = "VM6502 SP DRIVE".padEnd(16, " ");
				const id = [...name].map((c) => c.charCodeAt(0));
				return write([...status, name.trimEnd().length, ...id, 0x02, 0x20, 0x00, 0x01]);
			}
			default:
				return 0x21; // Bad Code
		}
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

		if (this.loggingEnabled) {
			const addressHex = bufferAddr.toString(16).toUpperCase().padStart(4, "0");
			postMessage({
				type: "log",
				channel: "disk",
				text: `READ block=${block} address=$${addressHex}`,
				payload: { name: "SP51", type: "READ", block, address: bufferAddr },
			});
		}

		const offset = block * 512;
		if (offset + 512 > this.diskData.length) return 0x27; // I/O Error

		for (let i = 0; i < 512; i++) this.bus.write(bufferAddr + i, this.diskData[offset + i] ?? 0);

		return 0;
	}
}
