// Commodore D64 disk images: the 1541's format, which the 4040 reads too. 35 (or 40) tracks of 256-byte
// sectors, numbered from 1 / 0; the BAM (the free sectors, the disk name) and the directory on track 18.
// Read-only.

export const D64_SECTOR_SIZE = 256;
export const DIRECTORY_TRACK = 18;
const PADDING = 0xa0; // shifted space: what pads the names

/** Sectors per track, by speed zone: tracks 1-17: 21, 18-24: 19, 25-30: 18, 31-40: 17. */
export const sectorsPerTrack = (track: number) => (track <= 17 ? 21 : track <= 24 ? 19 : track <= 30 ? 18 : 17);

/** Image sizes: 35 or 40 tracks, each with or without the error bytes (one per sector) after the sectors. */
const LAYOUTS = [
	{ tracks: 35, size: 174848 },
	{ tracks: 35, size: 174848 + 683 },
	{ tracks: 40, size: 196608 },
	{ tracks: 40, size: 196608 + 768 },
];

export const CBM_FILE_TYPES = ["DEL", "SEQ", "PRG", "USR", "REL"] as const;
export type CbmFileType = (typeof CBM_FILE_TYPES)[number];

export type D64Entry = {
	/** The name, PETSCII, without its padding. */
	name: Uint8Array;
	/** The type byte: bits 0-2 the type, bit 6 locked, bit 7 closed (properly written). */
	typeByte: number;
	/** "???" for a type code above 4 */
	type: CbmFileType | "???";
	closed: boolean;
	locked: boolean;
	track: number;
	sector: number;
	/** As the directory says (the DOS counts them when it writes the file) */
	blocks: number;
	/** Where the entry is: its directory sector, its slot there (0-7) */
	at: { track: number; sector: number; slot: number };
};

/**
 * A PETSCII byte as text, the way a CBM shows a file name: $20-$5F as ASCII (but £ ↑ ←), the shifted letters
 * ($C1-$DA) in lowercase, the shifted space as a space, "." for the rest (controls, graphics).
 */
export const petsciiChar = (byte: number) => {
	if (byte === 0x5c) return "£";
	if (byte === 0x5e) return "↑";
	if (byte === 0x5f) return "←";
	if (byte >= 0x20 && byte < 0x60) return String.fromCharCode(byte);
	if (byte >= 0xc1 && byte <= 0xda) return String.fromCharCode(byte - 0xc1 + 0x61);
	if (byte === 0xa0) return " ";
	return ".";
};

export const petsciiText = (bytes: Uint8Array) => Array.from(bytes, petsciiChar).join("");

export type ChainRead = {
	data: Uint8Array;
	/** The sectors read, in order, as linear indexes (track 1 sector 0 is 0) */
	sectors: number[];
	/** The chain ended on a link to a sector that doesn't exist, or looped back */
	broken: boolean;
};

/** The bytes without the trailing padding. */
const unpad = (bytes: Uint8Array) => {
	let end = bytes.length;
	while (end > 0 && bytes[end - 1] === PADDING) end--;
	return bytes.slice(0, end);
};

export class D64Image {
	readonly tracks: number;
	private readonly trackOffsets: number[] = [];

	/** Throws if the size isn't a D64's. The bytes are shared, not copied. */
	constructor(readonly data: Uint8Array) {
		const layout = LAYOUTS.find((l) => l.size === data.length);
		if (!layout) throw new Error(`Not a D64 image: ${data.length} bytes`);
		this.tracks = layout.tracks;
		let offset = 0;
		for (let track = 1; track <= this.tracks; track++) {
			this.trackOffsets[track] = offset;
			offset += sectorsPerTrack(track) * D64_SECTOR_SIZE;
		}
	}

	isValid(track: number, sector: number) {
		return track >= 1 && track <= this.tracks && sector >= 0 && sector < sectorsPerTrack(track);
	}

	/** Track 1 sector 0 is 0, then on through the tracks. -1: no such sector. */
	linearSector(track: number, sector: number) {
		if (!this.isValid(track, sector)) return -1;
		return (this.trackOffsets[track] as number) / D64_SECTOR_SIZE + sector;
	}

	/** The track and sector of a linear index (the other way of `linearSector`); null past the last sector. */
	trackSector(index: number): { track: number; sector: number } | null {
		if (index < 0) return null;
		for (let track = 1; track <= this.tracks; track++) {
			const first = (this.trackOffsets[track] as number) / D64_SECTOR_SIZE;
			if (index < first + sectorsPerTrack(track)) return { track, sector: index - first };
		}
		return null;
	}

	/** Where the sector is in the image; -1: no such sector. */
	sectorOffset(track: number, sector: number) {
		if (!this.isValid(track, sector)) return -1;
		return (this.trackOffsets[track] as number) + sector * D64_SECTOR_SIZE;
	}

	/** The sector's 256 bytes (a view on the image), or null if there's no such sector. */
	sector(track: number, sector: number): Uint8Array | null {
		const offset = this.sectorOffset(track, sector);
		return offset < 0 ? null : this.data.subarray(offset, offset + D64_SECTOR_SIZE);
	}

	private get bam() {
		return this.sector(DIRECTORY_TRACK, 0) as Uint8Array;
	}

	/**
	 * The sector is free in the BAM (a bit a sector, after the track's free count). Tracks 36-40 aren't in the
	 * BAM of a 1541 / 4040: undefined there.
	 */
	isFree(track: number, sector: number): boolean | undefined {
		if (!this.isValid(track, sector) || track > 35) return undefined;
		return ((this.bam[track * 4 + 1 + (sector >> 3)] as number) & (1 << (sector & 7))) !== 0;
	}

	/** The directory's sectors, in order (the chain from the BAM's link). */
	directorySectors(): { track: number; sector: number }[] {
		const sectors: { track: number; sector: number }[] = [];
		const seen = new Set<number>();
		let track = this.bam[0] as number;
		let sector = this.bam[1] as number;
		while (track !== 0) {
			const index = this.linearSector(track, sector);
			const bytes = this.sector(track, sector);
			if (!bytes || seen.has(index)) break;
			seen.add(index);
			sectors.push({ track, sector });
			track = bytes[0] as number;
			sector = bytes[1] as number;
		}
		return sectors;
	}

	/** The disk name, PETSCII, without its padding. */
	get diskName() {
		return unpad(this.bam.subarray(0x90, 0xa0));
	}

	/** The 5 bytes after the name: the disk ID, a shifted space, the DOS type ("2A"). */
	get idAndDosType() {
		return this.bam.slice(0xa2, 0xa7);
	}

	/** The free sectors the BAM counts on the 35 tracks, but the directory's. */
	get blocksFree() {
		let free = 0;
		for (let track = 1; track <= 35; track++) if (track !== DIRECTORY_TRACK) free += this.bam[track * 4] as number;
		return free;
	}

	/** The files, in directory order (the empty slots left out, the scratched ones too). */
	directory(): D64Entry[] {
		const entries: D64Entry[] = [];
		for (const { track, sector } of this.directorySectors()) {
			const bytes = this.sector(track, sector) as Uint8Array;
			for (let slot = 0; slot < 8; slot++) {
				const e = bytes.subarray(slot * 32, slot * 32 + 32);
				const typeByte = e[2] as number;
				if (typeByte === 0) continue; // empty, or scratched
				const code = typeByte & 7;
				entries.push({
					name: unpad(e.subarray(5, 21)),
					typeByte,
					type: CBM_FILE_TYPES[code] ?? "???",
					closed: (typeByte & 0x80) !== 0,
					locked: (typeByte & 0x40) !== 0,
					track: e[3] as number,
					sector: e[4] as number,
					blocks: (e[30] as number) | ((e[31] as number) << 8),
					at: { track, sector, slot },
				});
			}
		}
		return entries;
	}

	/**
	 * A file's bytes: the chain of sectors from (track, sector). Each sector links to the next by its first 2
	 * bytes; the last has track 0, and in the sector byte the offset of its last data byte.
	 */
	readChain(track: number, sector: number): ChainRead {
		const parts: Uint8Array[] = [];
		const sectors: number[] = [];
		let size = 0;
		let broken = false;
		while (true) {
			const bytes = this.sector(track, sector);
			const index = this.linearSector(track, sector);
			if (!bytes || sectors.includes(index)) {
				broken = true;
				break;
			}
			sectors.push(index);
			const nextTrack = bytes[0] as number;
			const nextSector = bytes[1] as number;
			const part = nextTrack === 0 ? bytes.subarray(2, Math.max(2, nextSector + 1)) : bytes.subarray(2);
			parts.push(part);
			size += part.length;
			if (nextTrack === 0) break;
			track = nextTrack;
			sector = nextSector;
		}
		const data = new Uint8Array(size);
		let offset = 0;
		for (const part of parts) {
			data.set(part, offset);
			offset += part.length;
		}
		return { data, sectors, broken };
	}
}

const LISTING_ADDRESS = 0x0401; // the PET's BASIC start

/**
 * The directory as the DOS sends it for `LOAD"$",8`: a BASIC program to LIST. The header line (line number:
 * the drive, the name in reverse), a line per file (line number: its blocks), then the blocks free.
 * `match` keeps the files whose name it accepts (the pattern of `"$0:A*"`).
 */
export function directoryListing(image: D64Image, drive = 0, match?: (name: Uint8Array) => boolean): Uint8Array {
	const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
	const lines: { number: number; text: number[] }[] = [];

	const name = [...image.diskName];
	while (name.length < 16) name.push(0x20);
	const idDos = [...image.idAndDosType].map((b) => (b === PADDING ? 0x20 : b));
	lines.push({ number: drive, text: [0x12, 0x22, ...name, 0x22, 0x20, ...idDos] });

	for (const entry of image.directory()) {
		if (match && !match(entry.name)) continue;
		const pad = entry.blocks < 10 ? 3 : entry.blocks < 100 ? 2 : 1;
		const quoted = [0x22, ...entry.name, 0x22];
		while (quoted.length < 18) quoted.push(0x20);
		const text = [
			...ascii(" ".repeat(pad)),
			...quoted,
			entry.closed ? 0x20 : 0x2a, // "*": not closed
			...ascii(entry.type),
			entry.locked ? 0x3c : 0x20, // "<": locked
		];
		lines.push({ number: entry.blocks, text });
	}
	lines.push({ number: image.blocksFree, text: ascii("BLOCKS FREE.") });

	const bytes = [LISTING_ADDRESS & 0xff, LISTING_ADDRESS >> 8];
	let address = LISTING_ADDRESS;
	for (const line of lines) {
		address += 4 + line.text.length + 1; // link, line number, text, 0
		bytes.push(address & 0xff, address >> 8, line.number & 0xff, line.number >> 8, ...line.text, 0);
	}
	bytes.push(0, 0);
	return new Uint8Array(bytes);
}
