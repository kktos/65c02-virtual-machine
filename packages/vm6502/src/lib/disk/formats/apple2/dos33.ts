// DOS 3.3: the VTOC (track $11, sector 0), the catalog sectors it points to, and the files' track / sector lists.
// Beneath Apple DOS, chapter 4.

import { type DiskImage, type TrackSector, TRACKS, SECTORS_PER_TRACK } from "./diskImage";

export const VTOC: TrackSector = { track: 0x11, sector: 0 };

export type Dos33Vtoc = {
	catalog: TrackSector;
	dosVersion: number;
	volume: number;
	maxTsPairs: number;
	lastTrackAllocated: number;
	direction: number;
	tracks: number;
	sectorsPerTrack: number;
	bytesPerSector: number;
	/** free[track][sector] */
	free: boolean[][];
	freeSectors: number;
};

export type Dos33File = {
	name: string;
	/** T I A B S R a b (a / b: the "new" A and B types) */
	type: string;
	typeByte: number;
	locked: boolean;
	deleted: boolean;
	/** The length in sectors the catalog gives (T/S list sectors included) */
	sectorCount: number;
	/** First T/S list sector */
	tsList: TrackSector;
	/** Where its catalog entry is */
	entry: TrackSector & { index: number };
};

export type Dos33Catalog = {
	vtoc: Dos33Vtoc;
	sectors: TrackSector[];
	files: Dos33File[];
	error?: string;
};

export type Dos33FileContent = {
	tsListSectors: TrackSector[];
	/** Data sectors in file order; null = a hole (a sparse random access text file) */
	dataSectors: (TrackSector | null)[];
	data: Uint8Array;
	/** B: load address and length, A / I: length (the first bytes of the file) */
	address?: number;
	length?: number;
	error?: string;
};

const TYPES: Record<number, string> = {
	0x00: "T",
	0x01: "I",
	0x02: "A",
	0x04: "B",
	0x08: "S",
	0x10: "R",
	0x20: "a",
	0x40: "b",
};
export const DOS33_TYPE_NAMES: Record<string, string> = {
	T: "Text",
	I: "Integer BASIC",
	A: "Applesoft BASIC",
	B: "Binary",
	S: "S type",
	R: "Relocatable",
	a: "A type (new)",
	b: "B type (new)",
};

const validTs = (ts: TrackSector) =>
	ts.track > 0 && ts.track < TRACKS && ts.sector >= 0 && ts.sector < SECTORS_PER_TRACK;
const key = (ts: TrackSector) => ts.track * SECTORS_PER_TRACK + ts.sector;

/** The VTOC, or null if track $11 sector 0 doesn't look like one. */
export function readVtoc(image: DiskImage): Dos33Vtoc | null {
	if (!image.hasTracks) return null;
	const s = image.readSector(VTOC.track, VTOC.sector);
	const catalog = { track: s[0x01], sector: s[0x02] };
	const tracks = s[0x34];
	const sectorsPerTrack = s[0x35];
	const bytesPerSector = s[0x36] | (s[0x37] << 8);
	if (!validTs(catalog) || sectorsPerTrack !== SECTORS_PER_TRACK || bytesPerSector !== 256) return null;
	if (tracks < 1 || tracks > 50) return null;

	const free: boolean[][] = [];
	let freeSectors = 0;
	for (let t = 0; t < TRACKS; t++) {
		// 4 bytes a track: bits FEDCBA98 76543210 (1 = free), then 2 unused bytes
		const bits = (s[0x38 + t * 4] << 8) | s[0x39 + t * 4];
		free.push(
			Array.from({ length: SECTORS_PER_TRACK }, (_, sector) => {
				const isFree = (bits & (1 << sector)) !== 0;
				if (isFree) freeSectors++;
				return isFree;
			}),
		);
	}
	return {
		catalog,
		dosVersion: s[0x03],
		volume: s[0x06],
		maxTsPairs: s[0x27],
		lastTrackAllocated: s[0x30],
		direction: s[0x31] > 127 ? s[0x31] - 256 : s[0x31],
		tracks,
		sectorsPerTrack,
		bytesPerSector,
		free,
		freeSectors,
	};
}

const fileName = (bytes: Uint8Array) =>
	Array.from(bytes, (b) => String.fromCharCode(b & 0x7f))
		.join("")
		// oxlint-disable-next-line no-control-regex -- DOS 3.3 names can hold control characters: shown as ^X
		.replace(/[\x00-\x1f]/g, (c) => `^${String.fromCharCode(c.charCodeAt(0) + 0x40)}`)
		.trimEnd();

export function readCatalog(image: DiskImage, vtoc: Dos33Vtoc): Dos33Catalog {
	const sectors: TrackSector[] = [];
	const files: Dos33File[] = [];
	const seen = new Set<number>();
	let ts = vtoc.catalog;
	let error: string | undefined;

	while (ts.track !== 0) {
		if (!validTs(ts)) {
			error = `Catalog link to a bad sector: T$${ts.track.toString(16)} S$${ts.sector.toString(16)}`;
			break;
		}
		if (seen.has(key(ts))) {
			error = "Catalog sectors loop";
			break;
		}
		seen.add(key(ts));
		sectors.push(ts);
		const s = image.readSector(ts.track, ts.sector);
		for (let index = 0; index < 7; index++) {
			const e = s.subarray(0x0b + index * 0x23, 0x0b + (index + 1) * 0x23);
			if (e[0] === 0x00) continue; // never used
			const deleted = e[0] === 0xff;
			const typeByte = e[2];
			files.push({
				// a deleted file: its first T/S list track is in the name's last byte
				name: fileName(e.subarray(3, deleted ? 0x20 : 0x21)),
				type: TYPES[typeByte & 0x7f] ?? "?",
				typeByte,
				locked: (typeByte & 0x80) !== 0,
				deleted,
				sectorCount: e[0x21] | (e[0x22] << 8),
				tsList: { track: deleted ? e[0x20] : e[0], sector: e[1] },
				entry: { ...ts, index },
			});
		}
		ts = { track: s[0x01], sector: s[0x02] };
	}
	return { vtoc, sectors, files, error };
}

export function readFile(image: DiskImage, file: Dos33File): Dos33FileContent {
	const tsListSectors: TrackSector[] = [];
	const dataSectors: (TrackSector | null)[] = [];
	const seen = new Set<number>();
	let ts = file.tsList;
	let error: string | undefined;

	while (ts.track !== 0) {
		if (!validTs(ts)) {
			error = `T/S list link to a bad sector: T$${ts.track.toString(16)} S$${ts.sector.toString(16)}`;
			break;
		}
		if (seen.has(key(ts))) {
			error = "T/S list loop";
			break;
		}
		seen.add(key(ts));
		tsListSectors.push(ts);
		const s = image.readSector(ts.track, ts.sector);
		const offset = s[0x05] | (s[0x06] << 8); // sector offset in the file of the first pair
		for (let i = 0; i < 122; i++) {
			const pair = { track: s[0x0c + i * 2], sector: s[0x0d + i * 2] };
			dataSectors[offset + i] = pair.track === 0 ? null : pair;
		}
		ts = { track: s[0x01], sector: s[0x02] };
	}

	// Trailing holes are the end of the file
	let count = dataSectors.length;
	while (count > 0 && !dataSectors[count - 1]) count--;
	dataSectors.length = count;
	for (let i = 0; i < count; i++) dataSectors[i] ??= null;

	const data = new Uint8Array(count * 256);
	dataSectors.forEach((d, i) => {
		if (d && validTs(d)) data.set(image.readSector(d.track, d.sector), i * 256);
	});

	const content: Dos33FileContent = { tsListSectors, dataSectors, data, error };
	const word = (at: number) => data[at] | (data[at + 1] << 8);
	const type = file.type.toUpperCase();
	if (data.length >= 4 && type === "B") {
		content.address = word(0);
		content.length = word(2);
	} else if (data.length >= 2 && (type === "A" || type === "I")) content.length = word(0);
	return content;
}

/** What each sector holds: "VTOC", "Catalog", "FILE" (T/S list) or "FILE", by `track * 16 + sector`. */
export function sectorOwners(image: DiskImage, catalog: Dos33Catalog): Map<number, string> {
	const owners = new Map<number, string>();
	owners.set(key(VTOC), "VTOC");
	for (const ts of catalog.sectors) owners.set(key(ts), "Catalog");
	for (const file of catalog.files) {
		if (file.deleted) continue;
		const { tsListSectors, dataSectors } = readFile(image, file);
		for (const ts of tsListSectors) owners.set(key(ts), `${file.name} (T/S list)`);
		for (const ts of dataSectors) if (ts) owners.set(key(ts), file.name);
	}
	return owners;
}
