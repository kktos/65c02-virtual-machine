// Builds D64 images for the tests: a formatted 35-track disk with files, as the DOS would write them.
import { sectorsPerTrack } from "@/lib/disk/d64";

export type BuiltFile = { name: string; data: Uint8Array | number[]; typeByte?: number; blocks?: number };

const TRACKS = 35;
const SIZE = 174848;

const offsetOf = (track: number, sector: number) => {
	let offset = 0;
	for (let t = 1; t < track; t++) offset += sectorsPerTrack(t) * 256;
	return offset + sector * 256;
};

const padded = (text: string, length: number) => {
	const bytes = Array.from({ length }, () => 0xa0);
	for (let i = 0; i < Math.min(text.length, length); i++) bytes[i] = text.charCodeAt(i);
	return bytes;
};

/** A formatted disk ("2A", every sector free) with the files, each in the next free sectors from track 1. */
export function buildD64(opts: { name?: string; id?: string; files?: BuiltFile[] } = {}): Uint8Array {
	const image = new Uint8Array(SIZE);
	const bam = offsetOf(18, 0);
	image.set([18, 1, 0x41, 0], bam);
	for (let track = 1; track <= TRACKS; track++) {
		const count = sectorsPerTrack(track);
		const bits = (1 << count) - 1;
		image.set([count, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff], bam + track * 4);
	}
	const use = (track: number, sector: number) => {
		const entry = bam + track * 4;
		image[entry] = (image[entry] as number) - 1;
		image[entry + 1 + (sector >> 3)] = (image[entry + 1 + (sector >> 3)] as number) & ~(1 << (sector & 7));
	};
	image.set(padded(opts.name ?? "TEST DISK", 16), bam + 0x90);
	image.set([0xa0, 0xa0, ...padded(opts.id ?? "AB", 2), 0xa0, 0x32, 0x41, 0xa0, 0xa0, 0xa0, 0xa0], bam + 0xa0);
	use(18, 0);

	// The files' sectors, in order from track 1 (skipping the directory track)
	let next = { track: 1, sector: 0 };
	const allocate = () => {
		const at = { ...next };
		use(at.track, at.sector);
		next.sector++;
		if (next.sector >= sectorsPerTrack(next.track)) {
			next = { track: next.track + 1, sector: 0 };
			if (next.track === 18) next.track = 19;
		}
		return at;
	};

	// The directory: 18/1, then 18/4, 18/7… (8 entries a sector)
	const files = opts.files ?? [];
	const dirSectors = Array.from({ length: Math.max(1, Math.ceil(files.length / 8)) }, (_, i) => 1 + i * 3);
	dirSectors.forEach((sector, i) => {
		use(18, sector);
		const last = i === dirSectors.length - 1;
		image.set(last ? [0, 0xff] : [18, dirSectors[i + 1] as number], offsetOf(18, sector));
	});

	files.forEach((file, i) => {
		const data = [...file.data];
		const chunks: number[][] = [];
		for (let pos = 0; pos < data.length || chunks.length === 0; pos += 254) chunks.push(data.slice(pos, pos + 254));
		const sectors = chunks.map(allocate);
		chunks.forEach((chunk, c) => {
			const at = sectors[c] as { track: number; sector: number };
			const link = sectors[c + 1];
			const offset = offsetOf(at.track, at.sector);
			image.set(link ? [link.track, link.sector] : [0, chunk.length + 1], offset);
			image.set(chunk, offset + 2);
		});
		const first = sectors[0] as { track: number; sector: number };
		const entry = offsetOf(18, dirSectors[Math.floor(i / 8)] as number) + (i % 8) * 32;
		const blocks = file.blocks ?? sectors.length;
		image.set([file.typeByte ?? 0x82, first.track, first.sector, ...padded(file.name, 16)], entry + 2);
		image.set([blocks & 0xff, blocks >> 8], entry + 30);
	});
	return image;
}

/** A BASIC program at $0401 (a PRG file: the load address first), from its lines as typed. */
export function basicProgram(lines: { number: number; tokens: number[] }[]): number[] {
	const bytes = [0x01, 0x04];
	let address = 0x0401;
	for (const line of lines) {
		address += 4 + line.tokens.length + 1;
		bytes.push(address & 0xff, address >> 8, line.number & 0xff, line.number >> 8, ...line.tokens, 0);
	}
	bytes.push(0, 0);
	return bytes;
}
