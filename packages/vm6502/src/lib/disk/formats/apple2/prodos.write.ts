// ProDOS, writing: a blank volume, a file added to a directory (seedling / sapling / tree, a full subdirectory
// growing a block). Beneath Apple ProDOS, chapter 4 / ProDOS 8 Technical Reference Manual, appendix B.
// Blocks are read with `.slice()` before being changed: `readBlock` gives a view of the image or a copy,
// depending on the sector order, and `writeBlock` puts them back either way.

import { BLOCK_SIZE, DiskImage } from "./diskImage";
import { readBitmap, readDirectory, VOLUME_DIR_BLOCK } from "./prodos";

const VOLUME_DIR_BLOCKS = 4;
const BITMAP_BLOCK = VOLUME_DIR_BLOCK + VOLUME_DIR_BLOCKS;
const ENTRY_LENGTH = 0x27;
const ENTRIES_PER_BLOCK = 0x0d;
const BLOCKS_PER_BITMAP = BLOCK_SIZE * 8;
export const MAX_NAME_LENGTH = 15;
/** The largest file: the EOF has 3 bytes */
export const MAX_EOF = 0xffffff;
/** Access: destroy, rename, backup, write, read / read only (and backup) */
const ACCESS_UNLOCKED = 0xe3;
const ACCESS_LOCKED = 0x21;

const STORAGE_SEEDLING = 1;
const STORAGE_SAPLING = 2;
const STORAGE_TREE = 3;

/** A file to write: its bytes, its ProDOS type and aux type */
export type ProdosNewFile = { name: string; data: Uint8Array; fileType: number; auxType: number; locked: boolean };

/**
 * A ProDOS name: a letter, then letters, digits and periods, 15 at most, upper case. What else is in a name
 * (spaces, punctuation: DOS 3.3 names) becomes a period; one not starting with a letter gets an "F" in front.
 */
export function prodosName(name: string) {
	let n = name
		.toUpperCase()
		.replace(/[^A-Z0-9.]+/g, ".")
		.replace(/^\.+/, "");
	if (!/^[A-Z]/.test(n)) n = `F${n}`;
	return n.slice(0, MAX_NAME_LENGTH).replace(/\.+$/, "");
}

/** yyyyyyym mmmddddd 000hhhhh 00mmmmmm: what `prodosDate` reads */
export function prodosDateBytes(d: Date) {
	const date = ((d.getFullYear() % 100) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
	return [date & 0xff, date >> 8, d.getMinutes(), d.getHours()];
}

const setWord = (b: Uint8Array, at: number, value: number) => {
	b[at] = value & 0xff;
	b[at + 1] = (value >> 8) & 0xff;
};
const word = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);

const setName = (b: Uint8Array, at: number, storageType: number, name: string) => {
	b[at] = (storageType << 4) | name.length;
	for (let i = 0; i < MAX_NAME_LENGTH; i++) b[at + 1 + i] = i < name.length ? name.charCodeAt(i) : 0;
};

/**
 * A blank volume of `totalBlocks` blocks, in ProDOS order: boot blocks 0-1 (`bootBlocks`, 1024 bytes, else zeros:
 * it doesn't boot), the volume directory in blocks 2-5, the bitmap from block 6.
 */
export function formatVolume(totalBlocks: number, volumeName: string, now = new Date(), bootBlocks?: Uint8Array) {
	const name = prodosName(volumeName);
	const data = new Uint8Array(totalBlocks * BLOCK_SIZE);
	if (bootBlocks) data.set(bootBlocks.subarray(0, 2 * BLOCK_SIZE));

	for (let i = 0; i < VOLUME_DIR_BLOCKS; i++) {
		const block = data.subarray((VOLUME_DIR_BLOCK + i) * BLOCK_SIZE, (VOLUME_DIR_BLOCK + i + 1) * BLOCK_SIZE);
		setWord(block, 0, i ? VOLUME_DIR_BLOCK + i - 1 : 0);
		setWord(block, 2, i < VOLUME_DIR_BLOCKS - 1 ? VOLUME_DIR_BLOCK + i + 1 : 0);
	}
	const header = data.subarray(VOLUME_DIR_BLOCK * BLOCK_SIZE + 4);
	setName(header, 0, 0xf, name);
	header.set(prodosDateBytes(now), 0x18);
	header[0x1e] = 0xc3;
	header[0x1f] = ENTRY_LENGTH;
	header[0x20] = ENTRIES_PER_BLOCK;
	setWord(header, 0x23, BITMAP_BLOCK);
	setWord(header, 0x25, totalBlocks);

	// 1 = free, MSB first; the boot blocks, the directory and the bitmap itself are used
	const bitmap = data.subarray(BITMAP_BLOCK * BLOCK_SIZE);
	const firstFree = BITMAP_BLOCK + Math.ceil(totalBlocks / BLOCKS_PER_BITMAP);
	for (let block = firstFree; block < totalBlocks; block++) bitmap[block >> 3] |= 0x80 >> (block & 7);
	return data;
}

/** The blocks a file of `eof` bytes takes: its data blocks, its index blocks (none for a seedling) */
export function fileBlocks(eof: number) {
	const data = Math.max(1, Math.ceil(eof / BLOCK_SIZE));
	const index = data === 1 ? 0 : data <= 256 ? 1 : 1 + Math.ceil(data / 256);
	return { data, index, total: data + index };
}

/** The volume's free blocks, taken one after the other, written back by `commit` */
function allocator(image: DiskImage) {
	const volume = readDirectory(image);
	const bitmap = readBitmap(image, volume);
	if (!bitmap) throw new Error("No volume bitmap");
	const free = bitmap.free;
	let left = bitmap.freeBlocks;
	let next = 0;
	return {
		get left() {
			return left;
		},
		take() {
			while (next < free.length && !free[next]) next++;
			if (next >= free.length) throw new Error("Disk full");
			free[next] = false;
			left--;
			return next++;
		},
		commit() {
			bitmap.blocks.forEach((block, n) => {
				const b = new Uint8Array(BLOCK_SIZE);
				for (let i = 0; i < BLOCKS_PER_BITMAP; i++)
					if (free[n * BLOCKS_PER_BITMAP + i]) b[i >> 3] |= 0x80 >> (i & 7);
				image.writeBlock(block, b);
			});
		},
	};
}

type Slot = { block: number; index: number };

/** A free entry of the directory; none: null, and where a new block would link from (its last block) */
function freeSlot(image: DiskImage, keyBlock: number) {
	const dir = readDirectory(image, keyBlock);
	if (dir.error) throw new Error(dir.error);
	for (const block of dir.blocks) {
		const b = image.readBlock(block);
		for (let index = block === keyBlock ? 1 : 0; index < ENTRIES_PER_BLOCK; index++)
			if (b[4 + index * ENTRY_LENGTH] >> 4 === 0) return { dir, slot: { block, index } as Slot | null };
	}
	return { dir, slot: null };
}

/** Where a subdirectory's own entry is in its parent: from its header, checked against the key pointer */
function parentEntry(image: DiskImage, keyBlock: number): Slot {
	const header = image.readBlock(keyBlock).subarray(4);
	const parent = word(header, 0x23);
	const number = header[0x25];
	if (parent <= 0 || parent >= image.blockCount) throw new Error(`Subdirectory ${keyBlock}: bad parent block`);
	const b = image.readBlock(parent);
	const keyOf = (index: number) => word(b, 4 + index * ENTRY_LENGTH + 0x11);
	// The entry number counts from 1 (the header of a key block is entry 1)
	if (number >= 1 && number <= ENTRIES_PER_BLOCK && keyOf(number - 1) === keyBlock)
		return { block: parent, index: number - 1 };
	for (let index = 0; index < ENTRIES_PER_BLOCK; index++)
		if (keyOf(index) === keyBlock) return { block: parent, index };
	throw new Error(`Subdirectory ${keyBlock}: its entry isn't in its parent`);
}

/** A subdirectory with no free entry: one more block, linked after its last, its entry in the parent updated */
function growDirectory(image: DiskImage, keyBlock: number, lastBlock: number, take: () => number): Slot {
	const block = take();
	const fresh = new Uint8Array(BLOCK_SIZE);
	setWord(fresh, 0, lastBlock);
	image.writeBlock(block, fresh);
	const last = image.readBlock(lastBlock).slice();
	setWord(last, 2, block);
	image.writeBlock(lastBlock, last);

	const at = parentEntry(image, keyBlock);
	const parent = image.readBlock(at.block).slice();
	const entry = parent.subarray(4 + at.index * ENTRY_LENGTH);
	setWord(entry, 0x13, word(entry, 0x13) + 1);
	const eof = entry[0x15] | (entry[0x16] << 8) | (entry[0x17] << 16);
	const grown = eof + BLOCK_SIZE;
	entry[0x15] = grown & 0xff;
	entry[0x16] = (grown >> 8) & 0xff;
	entry[0x17] = (grown >> 16) & 0xff;
	image.writeBlock(at.block, parent);
	return { block, index: 0 };
}

/** The file's bytes in data blocks, under an index (sapling) or a master index (tree): its key block, storage */
function writeData(image: DiskImage, data: Uint8Array, take: () => number) {
	const { data: count } = fileBlocks(data.length);
	const blocks: number[] = [];
	for (let i = 0; i < count; i++) {
		const block = take();
		image.writeBlock(block, data.subarray(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE));
		blocks.push(block);
	}
	const writeIndex = (pointers: number[]) => {
		const block = take();
		const b = new Uint8Array(BLOCK_SIZE);
		pointers.forEach((p, i) => {
			b[i] = p & 0xff;
			b[i + 256] = p >> 8;
		});
		image.writeBlock(block, b);
		return block;
	};
	if (count === 1) return { key: blocks[0] as number, storage: STORAGE_SEEDLING };
	if (count <= 256) return { key: writeIndex(blocks), storage: STORAGE_SAPLING };
	const indexes: number[] = [];
	for (let i = 0; i < count; i += 256) indexes.push(writeIndex(blocks.slice(i, i + 256)));
	return { key: writeIndex(indexes), storage: STORAGE_TREE };
}

/**
 * Adds a file to the directory whose key block is `keyBlock`; the name it got (`prodosName`). Nothing is written
 * when it can't be (the name taken, not enough room, a full volume directory): an error says why.
 */
export function addFile(image: DiskImage, keyBlock: number, file: ProdosNewFile, now = new Date()) {
	const name = prodosName(file.name);
	if (file.data.length > MAX_EOF) throw new Error(`${name}: too big for ProDOS (${file.data.length} bytes)`);
	const { dir, slot: found } = freeSlot(image, keyBlock);
	if (dir.entries.some((e) => e.name === name)) throw new Error(`${name} is already in the directory`);
	if (!found && dir.isVolume) throw new Error("The volume directory is full (51 entries)");

	const blocks = allocator(image);
	const needed = fileBlocks(file.data.length).total + (found ? 0 : 1);
	if (needed > blocks.left) throw new Error(`${name}: ${needed} blocks needed, ${blocks.left} free`);
	const take = () => blocks.take();

	const slot = found ?? growDirectory(image, keyBlock, dir.blocks[dir.blocks.length - 1] as number, take);
	const { key, storage } = writeData(image, file.data, take);

	const b = image.readBlock(slot.block).slice();
	const e = b.subarray(4 + slot.index * ENTRY_LENGTH, 4 + (slot.index + 1) * ENTRY_LENGTH);
	e.fill(0);
	setName(e, 0, storage, name);
	e[0x10] = file.fileType & 0xff;
	setWord(e, 0x11, key);
	setWord(e, 0x13, fileBlocks(file.data.length).total);
	e[0x15] = file.data.length & 0xff;
	e[0x16] = (file.data.length >> 8) & 0xff;
	e[0x17] = (file.data.length >> 16) & 0xff;
	const date = prodosDateBytes(now);
	e.set(date, 0x18);
	e[0x1e] = file.locked ? ACCESS_LOCKED : ACCESS_UNLOCKED;
	setWord(e, 0x1f, file.auxType);
	e.set(date, 0x21);
	setWord(e, 0x25, keyBlock);
	image.writeBlock(slot.block, b);

	const keyBlockBytes = image.readBlock(keyBlock).slice();
	setWord(keyBlockBytes, 4 + 0x21, word(keyBlockBytes, 4 + 0x21) + 1);
	image.writeBlock(keyBlock, keyBlockBytes);

	blocks.commit();
	return name;
}
