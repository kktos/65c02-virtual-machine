// A DOS 3.3 RWTS run from the SmartPort drive. The boot code that called the Disk II ReadSector ($Cn5C) is
// followed by a RWTS that drives the Disk II itself; the SmartPort card has no Disk II, so when that code reads
// the data latch ($C08C,X), the card finds the RWTS, as one did to crack a disk: who called the code reading
// the drive? The stack holds the answer. A RWTS keeping DOS 3.3's API (entry STY $48 / STA $49, the IOB in A/Y)
// then gets its entry replaced by a call to the card, which does the IOB's command on the disk image.
// The IOB: Beneath Apple DOS, chapter 6.

import { DiskImage, FLOPPY_SIZE, SECTOR_SIZE, SECTORS_PER_TRACK, TRACKS } from "@/lib/disk/formats/apple2/diskImage";
import type { IBus } from "@/types/bus.interface";

/** IOB fields */
export const IOB = {
	TYPE: 0x00, // $01
	SLOT: 0x01, // slot * 16
	DRIVE: 0x02, // 1 or 2
	VOLUME: 0x03, // expected; 0: any
	TRACK: 0x04,
	SECTOR: 0x05, // DOS 3.3 logical sector
	DCT: 0x06, // 2 bytes: the device characteristics table
	BUFFER: 0x08, // 2 bytes
	COMMAND: 0x0c, // 0 seek, 1 read, 2 write, 4 format
	ERROR: 0x0d,
	VOLUME_FOUND: 0x0e,
	LAST_SLOT: 0x0f,
	LAST_DRIVE: 0x10,
} as const;

export const RWTS_ERROR = {
	NONE: 0x00,
	WRITE_PROTECTED: 0x10,
	VOLUME_MISMATCH: 0x20,
	DRIVE_ERROR: 0x40,
	READ_ERROR: 0x80,
} as const;

/** The DOS 3.3 RWTS entry: STY $48 / STA $49, keeping the IOB address (Y lo, A hi) */
const ENTRY_SIGNATURE = [0x84, 0x48, 0x85, 0x49];

/** A call of the RWTS found on the stack: its `entry`, the stack offset of the return address its caller pushed. */
export type RwtsCall = { entry: number; frame: number; iob: number };

const peek = (bus: IBus, address: number) => (bus.peek ? bus.peek(address & 0xffff) : bus.read(address & 0xffff));
const peekWord = (bus: IBus, address: number) => peek(bus, address) | (peek(bus, address + 1) << 8);

/** An IOB's fields look like one: table type 1, drive 1 or 2, a command RWTS knows. */
export function isIob(bus: IBus, iob: number) {
	return (
		peek(bus, iob + IOB.TYPE) === 0x01 &&
		[1, 2].includes(peek(bus, iob + IOB.DRIVE)) &&
		[0, 1, 2, 4].includes(peek(bus, iob + IOB.COMMAND))
	);
}

/**
 * The RWTS call in progress, from the stack: from SP up, the first return address after a JSR to code
 * starting with the DOS 3.3 entry signature, with the IOB it keeps at $48/$49. Bytes that aren't a JSR's
 * return address (PHP, PHA) are skipped. Null: not a DOS 3.3-like RWTS.
 */
export function findRwtsCall(bus: IBus, sp: number): RwtsCall | null {
	for (let frame = sp + 1; frame < 0xff; frame++) {
		const jsr = (peekWord(bus, 0x100 + frame) - 2) & 0xffff;
		if (peek(bus, jsr) !== 0x20) continue;
		const entry = peekWord(bus, jsr + 1);
		if (!ENTRY_SIGNATURE.every((byte, i) => peek(bus, entry + i) === byte)) continue;
		const iob = peekWord(bus, 0x48);
		return isIob(bus, iob) ? { entry, frame, iob } : null;
	}
	return null;
}

/** The length of an instruction reading an absolute address (what reads $C08C,X): 3, else null. */
export function absoluteInstructionLength(opcode: number) {
	const column = opcode & 0x0f;
	if (column >= 0x0c && column <= 0x0e) return 3; // abs, abs,X (and abs,Y for LDX)
	if (column === 0x09 && opcode & 0x10) return 3; // abs,Y
	return null;
}

/** VTOC fields (Beneath Apple DOS, chapter 4) */
const VTOC = { CATALOG_TRACK: 0x01, VOLUME: 0x06, SECTORS_PER_TRACK: 0x35, BYTES_PER_SECTOR: 0x36 } as const;
const DEFAULT_VOLUME = 254;

/**
 * What the volume number was when the disk was formatted (a .dsk doesn't keep the address fields that hold
 * it): the VTOC's (T$11 S$00), if that sector is one; else 254, what DOS 3.3 INIT uses. A disk with its own
 * format (a game) can keep data in T$11: its byte 6 isn't a volume number.
 */
function volumeOf(image: DiskImage) {
	const vtoc = image.readSector(0x11, 0);
	const catalogTrack = vtoc[VTOC.CATALOG_TRACK] ?? 0;
	const volume = vtoc[VTOC.VOLUME] ?? 0;
	const isVtoc =
		catalogTrack > 0 &&
		catalogTrack < TRACKS &&
		vtoc[VTOC.SECTORS_PER_TRACK] === SECTORS_PER_TRACK &&
		vtoc[VTOC.BYTES_PER_SECTOR] === (SECTOR_SIZE & 0xff) &&
		vtoc[VTOC.BYTES_PER_SECTOR + 1] === SECTOR_SIZE >> 8 &&
		volume > 0 &&
		volume < 0xff;
	return isVtoc ? volume : DEFAULT_VOLUME;
}

export type IobResult = {
	error: number;
	command: number;
	track: number;
	sector: number;
	buffer: number;
	offset: number;
};

/** Where DOS 3.3 RWTS copies the IOB's DCT pointer and buffer (IOB+6..9), as it starts: $3C-$3F (A1, A2) */
const RWTS_ZP_DCT = 0x3c;

/**
 * The IOB's command on `data` (a 140K image in ProDOS order) from `slot`'s drive 1. The disk is read-only:
 * write and format answer "write protected". Writes the error code, volume found, last slot / drive to the IOB.
 * Like DOS 3.3 RWTS ($BD54), leaves the IOB's DCT pointer and buffer in $3C-$3F: code after it can count on
 * that. The monitor does: a DOS command typed at its prompt hands it an empty line back, and an empty line
 * dumps the 8 bytes after A1; were A1 left on $C081 (a "C081 C081" line before), $C083 would switch the
 * language card's RAM in under the monitor (Captain Goodnight's ACE crack, EXEC file loading the LC).
 */
export function serveIob(bus: IBus, iob: number, data: Uint8Array | null, slot: number): IobResult {
	const field = (offset: number) => peek(bus, iob + offset);
	for (let i = 0; i < 4; i++) bus.write(RWTS_ZP_DCT + i, field(IOB.DCT + i));
	const command = field(IOB.COMMAND);
	const track = field(IOB.TRACK);
	const sector = field(IOB.SECTOR);
	const buffer = peekWord(bus, iob + IOB.BUFFER);
	const image = data?.length === FLOPPY_SIZE ? new DiskImage(data, "prodos") : null;
	let offset = -1;

	const error = (() => {
		if (!image || field(IOB.SLOT) !== slot << 4 || field(IOB.DRIVE) !== 1) return RWTS_ERROR.DRIVE_ERROR;
		const volume = volumeOf(image);
		bus.write(iob + IOB.VOLUME_FOUND, volume);
		bus.write(iob + IOB.LAST_SLOT, slot << 4);
		bus.write(iob + IOB.LAST_DRIVE, 1);
		if (field(IOB.VOLUME) && field(IOB.VOLUME) !== volume) return RWTS_ERROR.VOLUME_MISMATCH;
		if (track >= TRACKS) return RWTS_ERROR.DRIVE_ERROR;
		switch (command) {
			case 0: // seek
				return RWTS_ERROR.NONE;
			case 1: {
				if (sector >= SECTORS_PER_TRACK) return RWTS_ERROR.READ_ERROR;
				offset = image.sectorOffset(track, sector);
				for (let i = 0; i < SECTOR_SIZE; i++) bus.write((buffer + i) & 0xffff, image.data[offset + i] ?? 0);
				return RWTS_ERROR.NONE;
			}
			case 2: // write
			case 4: // format
				return RWTS_ERROR.WRITE_PROTECTED;
			default:
				return RWTS_ERROR.DRIVE_ERROR;
		}
	})();

	bus.write(iob + IOB.ERROR, error);
	return { error, command, track, sector, buffer, offset };
}
