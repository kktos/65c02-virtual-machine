// A disk image as stored in a file: raw bytes (a .2mg header stripped) in DOS 3.3 or ProDOS sector order.
// Reads DOS 3.3 sectors (track / logical sector, 256 bytes) and ProDOS blocks (512 bytes) whatever the order.
//
// A 5.25" disk: 35 tracks x 16 sectors x 256 bytes = 143360 bytes. The two orders store the same physical
// sectors in a different sequence:
// - DOS order (.dsk, .do): sector s of track t at (t * 16 + s) * 256, s being a DOS 3.3 logical sector
// - ProDOS order (.po): block b at b * 512, a block being 2 ProDOS logical sectors of track b / 8
// Bigger images (.hdv, 800K .po / .2mg) have no tracks: blocks only.

import type { TrackSector } from "../../diskFormat.type";

export type SectorOrder = "dos" | "prodos";

export const SECTOR_SIZE = 256;
export const BLOCK_SIZE = 512;
export const TRACKS = 35;
export const SECTORS_PER_TRACK = 16;
export const FLOPPY_SIZE = TRACKS * SECTORS_PER_TRACK * SECTOR_SIZE; // 143360

/** DOS 3.3 logical sector -> physical sector */
const DOS_TO_PHYS = [0x0, 0xd, 0xb, 0x9, 0x7, 0x5, 0x3, 0x1, 0xe, 0xc, 0xa, 0x8, 0x6, 0x4, 0x2, 0xf];
/** ProDOS logical sector -> physical sector */
const PRODOS_TO_PHYS = [0x0, 0x2, 0x4, 0x6, 0x8, 0xa, 0xc, 0xe, 0x1, 0x3, 0x5, 0x7, 0x9, 0xb, 0xd, 0xf];

const invert = (table: number[]) => {
	const inv: number[] = [];
	table.forEach((phys, logical) => {
		inv[phys] = logical;
	});
	return inv;
};
const PHYS_TO_DOS = invert(DOS_TO_PHYS);
const PHYS_TO_PRODOS = invert(PRODOS_TO_PHYS);

export type { TrackSector };

export type Header2mg = {
	creator: string;
	/** 0 = DOS order, 1 = ProDOS order, 2 = nibbles */
	format: number;
	dataOffset: number;
	dataLength: number;
	volume?: number;
	locked: boolean;
};

/** The .2mg header, if the file starts with "2IMG". https://gswv.apple2.org.za/a2zine/Docs/DiskImage_2MG_Info.txt */
export function parse2mgHeader(file: Uint8Array): Header2mg | null {
	if (file.length < 64) return null;
	if (String.fromCharCode(file[0], file[1], file[2], file[3]) !== "2IMG") return null;
	const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
	const flags = view.getUint32(0x10, true);
	const dataOffset = view.getUint32(0x18, true) || 64;
	let dataLength = view.getUint32(0x1c, true);
	if (!dataLength || dataOffset + dataLength > file.length) dataLength = file.length - dataOffset;
	return {
		creator: String.fromCharCode(file[4], file[5], file[6], file[7]),
		format: view.getUint32(0x0c, true),
		dataOffset,
		dataLength,
		volume: flags & 0x100 ? flags & 0xff : undefined,
		locked: (flags & 0x80000000) !== 0,
	};
}

export class DiskImage {
	constructor(
		readonly data: Uint8Array,
		readonly order: SectorOrder,
	) {}

	/** A 5.25" floppy: it has tracks and sectors (other sizes are blocks only). */
	get hasTracks() {
		return this.data.length === FLOPPY_SIZE;
	}

	get blockCount() {
		return Math.floor(this.data.length / BLOCK_SIZE);
	}

	/** Where DOS 3.3 sector `sector` (logical) of track `track` is in the image. */
	sectorOffset(track: number, sector: number) {
		if (!this.hasTracks) throw new Error("No tracks on this image: blocks only");
		if (track < 0 || track >= TRACKS || sector < 0 || sector >= SECTORS_PER_TRACK)
			throw new Error(`No track $${track.toString(16)} / sector $${sector.toString(16)}`);
		const index = this.order === "dos" ? sector : PHYS_TO_PRODOS[DOS_TO_PHYS[sector]];
		return (track * SECTORS_PER_TRACK + index) * SECTOR_SIZE;
	}

	readSector(track: number, sector: number): Uint8Array {
		const offset = this.sectorOffset(track, sector);
		return this.data.subarray(offset, offset + SECTOR_SIZE);
	}

	/** The 2 DOS 3.3 sectors (track, logical sector) a block is made of, on a floppy. */
	blockSectors(block: number): [TrackSector, TrackSector] {
		const track = Math.floor(block / 8);
		const first = (block % 8) * 2;
		const toDos = (prodosSector: number) => PHYS_TO_DOS[PRODOS_TO_PHYS[prodosSector]];
		return [
			{ track, sector: toDos(first) },
			{ track, sector: toDos(first + 1) },
		];
	}

	/** The block a sector belongs to (and which half of it), on a floppy. */
	sectorBlock(track: number, sector: number): { block: number; half: 0 | 1 } {
		const prodosSector = PHYS_TO_PRODOS[DOS_TO_PHYS[sector]];
		return { block: track * 8 + (prodosSector >> 1), half: (prodosSector & 1) as 0 | 1 };
	}

	readBlock(block: number): Uint8Array {
		if (block < 0 || block >= this.blockCount) throw new Error(`No block $${block.toString(16)}`);
		if (this.order === "prodos" || !this.hasTracks)
			return this.data.subarray(block * BLOCK_SIZE, (block + 1) * BLOCK_SIZE);
		const [lo, hi] = this.blockSectors(block);
		const out = new Uint8Array(BLOCK_SIZE);
		out.set(this.readSector(lo.track, lo.sector), 0);
		out.set(this.readSector(hi.track, hi.sector), SECTOR_SIZE);
		return out;
	}

	/** The same disk in the other order (same bytes moved around). */
	withOrder(order: SectorOrder): DiskImage {
		return order === this.order ? this : new DiskImage(this.data, order);
	}
}

/** "$1F" */
export const hex = (value: number, pad = 2) => `$${value.toString(16).toUpperCase().padStart(pad, "0")}`;

/** Apple II text: high-bit ASCII (or plain), control characters as "." */
export const appleChar = (byte: number) => {
	const c = byte & 0x7f;
	return c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ".";
};
