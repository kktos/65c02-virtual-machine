// ProDOS: the volume directory (key block 2), subdirectories, files (seedling / sapling / tree, extended),
// the volume bitmap. Beneath Apple ProDOS, chapter 4 / ProDOS 8 Technical Reference Manual, appendix B.

import { BLOCK_SIZE, type DiskImage } from "./diskImage";

export const VOLUME_DIR_BLOCK = 2;

export const STORAGE_TYPES: Record<number, string> = {
	0x1: "Seedling",
	0x2: "Sapling",
	0x3: "Tree",
	0x4: "Pascal area",
	0x5: "Extended",
	0xd: "Directory",
	0xe: "Subdirectory header",
	0xf: "Volume header",
};

export const FILE_TYPES: Record<number, string> = {
	0x00: "UNK",
	0x01: "BAD",
	0x04: "TXT",
	0x06: "BIN",
	0x08: "FOT",
	0x0f: "DIR",
	0x19: "ADB",
	0x1a: "AWP",
	0x1b: "ASP",
	0xb3: "S16",
	0xc0: "PNT",
	0xc1: "PIC",
	0xe0: "LBR",
	0xef: "PAS",
	0xf0: "CMD",
	0xf9: "OS",
	0xfa: "INT",
	0xfb: "IVR",
	0xfc: "BAS",
	0xfd: "VAR",
	0xfe: "REL",
	0xff: "SYS",
};

export const fileTypeName = (type: number) =>
	FILE_TYPES[type] ?? `$${type.toString(16).toUpperCase().padStart(2, "0")}`;

export type ProdosEntry = {
	name: string;
	storageType: number;
	fileType: number;
	keyPointer: number;
	blocksUsed: number;
	eof: number;
	created: string | null;
	modified: string | null;
	version: number;
	minVersion: number;
	access: number;
	auxType: number;
	/** Where the entry is */
	block: number;
	index: number;
};

export type ProdosDirectory = {
	name: string;
	/** Volume directory or subdirectory */
	isVolume: boolean;
	keyBlock: number;
	blocks: number[];
	entries: ProdosEntry[];
	fileCount: number;
	created: string | null;
	/** Volume directory only */
	bitmapPointer?: number;
	totalBlocks?: number;
	error?: string;
};

export type ProdosFileContent = {
	/** Index blocks (master index, index blocks, extended key block) */
	indexBlocks: number[];
	/** Data blocks in file order, 0 = sparse (reads as zeros) */
	dataBlocks: number[];
	data: Uint8Array;
	/** Extended files: the resource fork's blocks */
	resourceBlocks?: number[];
	error?: string;
};

export type ProdosBitmap = { free: boolean[]; freeBlocks: number; blocks: number[] };

const MAX_DEPTH = 16;

/** yyyyyyym mmmddddd 000hhhhh 00mmmmmm -> "1986-03-12 14:05" */
export function prodosDate(b: Uint8Array, at: number): string | null {
	const date = b[at] | (b[at + 1] << 8);
	if (!date) return null;
	const day = date & 0x1f;
	const month = (date >> 5) & 0x0f;
	let year = date >> 9;
	year += year < 40 ? 2000 : 1900;
	const minute = b[at + 2] & 0x3f;
	const hour = b[at + 3] & 0x1f;
	const p = (n: number) => String(n).padStart(2, "0");
	return `${year}-${p(month)}-${p(day)} ${p(hour)}:${p(minute)}`;
}

const nameAt = (b: Uint8Array, at: number) => {
	const len = b[at] & 0x0f;
	return Array.from(b.subarray(at + 1, at + 1 + len), (c) => String.fromCharCode(c & 0x7f)).join("");
};

const word = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);

/** Volume directory key block looks like one (a volume header, the standard entry length and count). */
export function isProdosVolume(image: DiskImage): boolean {
	if (image.blockCount <= VOLUME_DIR_BLOCK) return false;
	const b = image.readBlock(VOLUME_DIR_BLOCK);
	return word(b, 0) === 0 && b[4] >> 4 === 0xf && (b[4] & 0x0f) > 0 && b[0x23] === 0x27 && b[0x24] === 0x0d;
}

export function readDirectory(image: DiskImage, keyBlock = VOLUME_DIR_BLOCK): ProdosDirectory {
	const blocks: number[] = [];
	const entries: ProdosEntry[] = [];
	const first = image.readBlock(keyBlock);
	const header = first.subarray(4);
	const isVolume = header[0] >> 4 === 0xf;
	const entryLength = header[0x1f] || 0x27;
	const entriesPerBlock = header[0x20] || 0x0d;
	const dir: ProdosDirectory = {
		name: nameAt(header, 0),
		isVolume,
		keyBlock,
		blocks,
		entries,
		fileCount: word(header, 0x21),
		created: prodosDate(header, 0x18),
	};
	if (isVolume) {
		dir.bitmapPointer = word(header, 0x23);
		dir.totalBlocks = word(header, 0x25);
	} else if (header[0] >> 4 !== 0xe) dir.error = `Block ${keyBlock} is not a directory key block`;

	const seen = new Set<number>();
	let block = keyBlock;
	let index = 1; // entry 0 of the key block is the header
	while (block !== 0) {
		if (block >= image.blockCount) {
			dir.error = `Directory link to a bad block: ${block}`;
			break;
		}
		if (seen.has(block)) {
			dir.error = "Directory blocks loop";
			break;
		}
		seen.add(block);
		blocks.push(block);
		const b = image.readBlock(block);
		for (; index < entriesPerBlock; index++) {
			const at = 4 + index * entryLength;
			if (at + entryLength > BLOCK_SIZE) break;
			const e = b.subarray(at, at + entryLength);
			if (e[0] >> 4 === 0) continue; // deleted / unused
			entries.push({
				name: nameAt(e, 0),
				storageType: e[0] >> 4,
				fileType: e[0x10],
				keyPointer: word(e, 0x11),
				blocksUsed: word(e, 0x13),
				eof: e[0x15] | (e[0x16] << 8) | (e[0x17] << 16),
				created: prodosDate(e, 0x18),
				version: e[0x1c],
				minVersion: e[0x1d],
				access: e[0x1e],
				auxType: word(e, 0x1f),
				modified: prodosDate(e, 0x21),
				block,
				index,
			});
		}
		index = 0;
		block = word(b, 2);
	}
	return dir;
}

export function readFile(
	image: DiskImage,
	entry: Pick<ProdosEntry, "storageType" | "keyPointer" | "eof">,
): ProdosFileContent {
	const indexBlocks: number[] = [];
	const dataBlocks: number[] = [];
	let error: string | undefined;
	const valid = (block: number) => block > 0 && block < image.blockCount;

	const readIndex = (block: number) => {
		indexBlocks.push(block);
		const b = image.readBlock(block);
		return Array.from({ length: 256 }, (_, i) => b[i] | (b[i + 256] << 8));
	};

	const readFork = (storageType: number, keyPointer: number, eof: number) => {
		if (!valid(keyPointer)) {
			error = `Bad key block: ${keyPointer}`;
			return;
		}
		const blockCount = Math.ceil(eof / BLOCK_SIZE);
		if (storageType === 1) dataBlocks.push(keyPointer);
		else if (storageType === 2) dataBlocks.push(...readIndex(keyPointer).slice(0, Math.max(1, blockCount)));
		else if (storageType === 3) {
			const indexes = readIndex(keyPointer).slice(0, Math.max(1, Math.ceil(blockCount / 256)));
			for (const index of indexes) {
				if (index === 0) dataBlocks.push(...Array.from({ length: 256 }, () => 0));
				else if (!valid(index)) {
					error = `Bad index block: ${index}`;
					return;
				} else dataBlocks.push(...readIndex(index));
			}
			dataBlocks.length = Math.min(dataBlocks.length, Math.max(1, blockCount));
		} else error = `Storage type ${storageType} not read`;
	};

	let eof = entry.eof;
	let resourceBlocks: number[] | undefined;
	if (entry.storageType === 5) {
		// Extended key block: the data fork's mini entry at +$000, the resource fork's at +$100
		if (!valid(entry.keyPointer)) error = `Bad key block: ${entry.keyPointer}`;
		else {
			indexBlocks.push(entry.keyPointer);
			const ext = image.readBlock(entry.keyPointer);
			const fork = (at: number) => ({
				storageType: ext[at] & 0x0f,
				keyPointer: word(ext, at + 1),
				eof: ext[at + 5] | (ext[at + 6] << 8) | (ext[at + 7] << 16),
			});
			const resource = fork(0x100);
			readFork(resource.storageType, resource.keyPointer, resource.eof);
			resourceBlocks = dataBlocks.splice(0);
			const data = fork(0);
			eof = data.eof;
			readFork(data.storageType, data.keyPointer, data.eof);
		}
	} else readFork(entry.storageType, entry.keyPointer, eof);

	const data = new Uint8Array(eof);
	dataBlocks.forEach((block, i) => {
		if (!valid(block) || i * BLOCK_SIZE >= eof) return;
		data.set(image.readBlock(block).subarray(0, Math.min(BLOCK_SIZE, eof - i * BLOCK_SIZE)), i * BLOCK_SIZE);
	});
	return { indexBlocks, dataBlocks, data, resourceBlocks, error };
}

/** The volume bitmap: a bit per block, 1 = free, MSB first. */
export function readBitmap(image: DiskImage, volume: ProdosDirectory): ProdosBitmap | null {
	const { bitmapPointer, totalBlocks } = volume;
	if (!bitmapPointer || !totalBlocks || bitmapPointer >= image.blockCount) return null;
	const free: boolean[] = [];
	const blocks: number[] = [];
	let freeBlocks = 0;
	for (let n = 0; n < Math.ceil(totalBlocks / 4096); n++) {
		const block = bitmapPointer + n;
		if (block >= image.blockCount) break;
		blocks.push(block);
		const b = image.readBlock(block);
		for (let i = 0; i < 4096 && free.length < totalBlocks; i++) {
			const isFree = (b[i >> 3] & (0x80 >> (i & 7))) !== 0;
			if (isFree) freeBlocks++;
			free.push(isFree);
		}
	}
	return { free, freeBlocks, blocks };
}

export const isDirectory = (entry: ProdosEntry) => entry.storageType === 0xd;

/** What each block holds: "Boot", "Volume directory", "Bitmap", "/DIR", "/DIR/FILE (index)", "/DIR/FILE"... */
export function blockOwners(image: DiskImage, volume: ProdosDirectory): Map<number, string> {
	const owners = new Map<number, string>();
	owners.set(0, "Boot");
	owners.set(1, "Boot");
	const bitmap = readBitmap(image, volume);
	for (const block of bitmap?.blocks ?? []) owners.set(block, "Bitmap");

	const walk = (dir: ProdosDirectory, path: string, depth: number) => {
		for (const block of dir.blocks) owners.set(block, dir.isVolume ? "Volume directory" : path);
		if (depth > MAX_DEPTH) return;
		for (const entry of dir.entries) {
			const name = `${path}/${entry.name}`;
			if (isDirectory(entry)) {
				if (entry.keyPointer > 0 && entry.keyPointer < image.blockCount && !owners.has(entry.keyPointer))
					walk(readDirectory(image, entry.keyPointer), name, depth + 1);
				continue;
			}
			if (entry.storageType > 5) continue;
			const { indexBlocks, dataBlocks, resourceBlocks } = readFile(image, entry);
			for (const block of indexBlocks) owners.set(block, `${name} (index)`);
			for (const block of dataBlocks) if (block) owners.set(block, name);
			for (const block of resourceBlocks ?? []) if (block) owners.set(block, `${name} (resource fork)`);
		}
	};
	walk(volume, "", 0);
	return owners;
}
