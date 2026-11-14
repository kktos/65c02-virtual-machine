import { describe, expect, it } from "vitest";
import { analyzeDisk } from "@/lib/disk/formats/apple2/analyzeDisk";
import { apple2Format } from "@/lib/disk/formats/apple2/apple2.format";
import { DiskImage, FLOPPY_SIZE, type SectorOrder } from "@/lib/disk/formats/apple2/diskImage";
import { readFile as readDosFile, sectorOwners } from "@/lib/disk/formats/apple2/dos33";
import { blockOwners, readBitmap, readDirectory, readFile as readProdosFile } from "@/lib/disk/formats/apple2/prodos";

const writeSector = (image: DiskImage, track: number, sector: number, bytes: ArrayLike<number>, at = 0) =>
	image.data.set(bytes, image.sectorOffset(track, sector) + at);

const writeBlock = (image: DiskImage, block: number, bytes: ArrayLike<number>) => {
	const full = new Uint8Array(512);
	full.set(bytes);
	const [lo, hi] = image.blockSectors(block);
	writeSector(image, lo.track, lo.sector, full.subarray(0, 256));
	writeSector(image, hi.track, hi.sector, full.subarray(256));
};

const appleName = (name: string, length: number) => Array.from(name.padEnd(length, " "), (c) => c.charCodeAt(0) | 0x80);

/** A DOS 3.3 disk: HELLO (B, locked, 2 data sectors at $0300), a deleted OLD file */
function dos33Disk(order: SectorOrder) {
	const image = new DiskImage(new Uint8Array(FLOPPY_SIZE), order);
	const vtoc = new Uint8Array(256);
	vtoc.set([0x04, 0x11, 0x0f, 0x03], 0);
	vtoc[0x06] = 0xfe;
	vtoc[0x27] = 122;
	vtoc.set([0x12, 0x01], 0x30);
	vtoc.set([35, 16, 0x00, 0x01], 0x34);
	vtoc.set([0xff, 0xff], 0x38 + 0x20 * 4); // track $20 all free
	vtoc.set([0x80, 0x01], 0x38 + 0x21 * 4); // track $21: sectors $F and 0 free
	writeSector(image, 0x11, 0, vtoc);

	const catalog = new Uint8Array(256);
	catalog.set([0x12, 0x0f, 0x84, ...appleName("HELLO", 30), 3, 0], 0x0b);
	catalog.set([0xff, 0x05, 0x04, ...appleName("OLD", 29), 0x13, 2, 0], 0x0b + 0x23);
	writeSector(image, 0x11, 0x0f, catalog);

	const tsList = new Uint8Array(256);
	tsList.set([0x12, 0x0e, 0x12, 0x0d], 0x0c);
	writeSector(image, 0x12, 0x0f, tsList);
	writeSector(image, 0x12, 0x0e, [0x00, 0x03, 0x05, 0x00, 0xa9, 0xc1, 0x60]);
	writeSector(image, 0x12, 0x0d, [0xee]);
	return image;
}

/** A ProDOS volume /TEST: HELLO (seedling), BIG (sapling, 600 bytes), SUB/INNER */
function prodosDisk(order: SectorOrder) {
	const image = new DiskImage(new Uint8Array(FLOPPY_SIZE), order);
	const entry = (name: string, storage: number, type: number, key: number, used: number, eof: number) => {
		const e = new Uint8Array(0x27);
		e[0] = (storage << 4) | name.length;
		e.set(
			Array.from(name, (c) => c.charCodeAt(0)),
			1,
		);
		e[0x10] = type;
		e.set([key & 0xff, key >> 8, used & 0xff, used >> 8, eof & 0xff, (eof >> 8) & 0xff, eof >> 16], 0x11);
		e.set([0x6c, 0xac, 5, 14], 0x18); // 1986-03-12 14:05
		e.set([0x00, 0x20], 0x1f); // aux $2000
		return e;
	};
	const dir = (header: Uint8Array, entries: Uint8Array[]) => {
		const b = new Uint8Array(512);
		b.set(header, 4);
		entries.forEach((e, i) => b.set(e, 4 + (i + 1) * 0x27));
		return b;
	};

	const vol = new Uint8Array(0x27);
	vol[0] = 0xf4;
	vol.set(
		Array.from("TEST", (c) => c.charCodeAt(0)),
		1,
	);
	vol.set([0x27, 0x0d, 3, 0, 6, 0, 0x18, 0x01], 0x1f); // 3 files, bitmap at 6, 280 blocks
	writeBlock(
		image,
		2,
		dir(vol, [
			entry("HELLO", 1, 0x06, 7, 1, 10),
			entry("BIG", 2, 0x04, 8, 3, 600),
			entry("SUB", 0xd, 0x0f, 11, 1, 512),
		]),
	);

	const bitmap = new Uint8Array(512);
	bitmap.fill(0xff, 2, 35); // blocks 16-279 free
	bitmap[1] = 0x07; // blocks 13, 14, 15 free
	writeBlock(image, 6, bitmap);

	writeBlock(image, 7, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	const index = new Uint8Array(512);
	index.set([9, 10], 0);
	writeBlock(image, 8, index);
	writeBlock(image, 9, new Uint8Array(512).fill(0xaa));
	writeBlock(image, 10, new Uint8Array(512).fill(0xbb));

	const sub = new Uint8Array(0x27);
	sub[0] = 0xe3;
	sub.set(
		Array.from("SUB", (c) => c.charCodeAt(0)),
		1,
	);
	sub.set([0x27, 0x0d, 1, 0], 0x1f);
	writeBlock(image, 11, dir(sub, [entry("INNER", 1, 0xff, 12, 1, 3)]));
	writeBlock(image, 12, [0x4c, 0x00, 0x20]);
	return image;
}

describe("DiskImage", () => {
	it("maps DOS sectors to ProDOS blocks: block 2 = T0 S$B + S$A", () => {
		const image = new DiskImage(new Uint8Array(FLOPPY_SIZE), "dos");
		expect(image.blockSectors(0)).toEqual([
			{ track: 0, sector: 0x0 },
			{ track: 0, sector: 0xe },
		]);
		expect(image.blockSectors(2)).toEqual([
			{ track: 0, sector: 0xb },
			{ track: 0, sector: 0xa },
		]);
		expect(image.sectorBlock(0, 0xa)).toEqual({ block: 2, half: 1 });
	});

	it("reads the same block from both orders", () => {
		for (const order of ["dos", "prodos"] as const) {
			const image = new DiskImage(new Uint8Array(FLOPPY_SIZE), order);
			writeBlock(image, 5, [0x12, 0x34]);
			expect(Array.from(image.readBlock(5).subarray(0, 2))).toEqual([0x12, 0x34]);
		}
	});
});

describe("DOS 3.3", () => {
	it.each([
		["game.dsk", "dos"],
		["game.po", "prodos"],
	] as const)("finds the catalog in %s (%s order)", (name, order) => {
		const disk = analyzeDisk(dos33Disk(order).data, name);
		expect(disk.format).toBe("dos33");
		expect(disk.image.order).toBe(order);
		const { vtoc, files, sectors } = disk.dos33!;
		expect(vtoc.volume).toBe(0xfe);
		expect(vtoc.freeSectors).toBe(18);
		expect(vtoc.free[0x21][0xf]).toBe(true);
		expect(vtoc.free[0x21][1]).toBe(false);
		expect(sectors).toEqual([{ track: 0x11, sector: 0x0f }]);
		expect(files.map((f) => [f.name, f.type, f.locked, f.deleted, f.tsList.track])).toEqual([
			["HELLO", "B", true, false, 0x12],
			["OLD", "B", false, true, 0x13],
		]);
	});

	it("reads a file through its T/S list", () => {
		const image = dos33Disk("dos");
		const { dos33 } = analyzeDisk(image.data, "game.dsk");
		const content = readDosFile(image, dos33!.files[0]);
		expect(content.tsListSectors).toEqual([{ track: 0x12, sector: 0x0f }]);
		expect(content.dataSectors).toEqual([
			{ track: 0x12, sector: 0x0e },
			{ track: 0x12, sector: 0x0d },
		]);
		expect(content.address).toBe(0x0300);
		expect(content.length).toBe(5);
		expect(content.data[256]).toBe(0xee);

		const owners = sectorOwners(image, dos33!);
		expect(owners.get(0x11 * 16)).toBe("VTOC");
		expect(owners.get(0x12 * 16 + 0x0f)).toBe("HELLO (T/S list)");
		expect(owners.get(0x12 * 16 + 0x0d)).toBe("HELLO");
	});

	it("stops on a T/S list loop", () => {
		const image = dos33Disk("dos");
		writeSector(image, 0x12, 0x0f, [0x12, 0x0f], 1);
		const { dos33 } = analyzeDisk(image.data, "game.dsk");
		expect(readDosFile(image, dos33!.files[0]).error).toBe("T/S list loop");
	});
});

describe("ProDOS", () => {
	it.each([
		["vol.po", "prodos"],
		["vol.dsk", "dos"],
	] as const)("finds the volume in %s (%s order)", (name, order) => {
		const disk = analyzeDisk(prodosDisk(order).data, name);
		expect(disk.format).toBe("prodos");
		expect(disk.image.order).toBe(order);
		expect(disk.orderSource).toBe("detected");
		const vol = disk.prodos!;
		expect(vol.name).toBe("TEST");
		expect(vol.totalBlocks).toBe(280);
		expect(vol.entries.map((e) => [e.name, e.storageType, e.eof])).toEqual([
			["HELLO", 1, 10],
			["BIG", 2, 600],
			["SUB", 0xd, 512],
		]);
		expect(vol.entries[0].created).toBe("1986-03-12 14:05");
		expect(readBitmap(disk.image, vol)?.freeBlocks).toBe(267);
	});

	it("reads seedling, sapling and subdirectory files", () => {
		const image = prodosDisk("prodos");
		const vol = readDirectory(image);
		const hello = readProdosFile(image, vol.entries[0]);
		expect(Array.from(hello.data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		const big = readProdosFile(image, vol.entries[1]);
		expect(big.indexBlocks).toEqual([8]);
		expect(big.dataBlocks).toEqual([9, 10]);
		expect(big.data.length).toBe(600);
		expect(big.data[511]).toBe(0xaa);
		expect(big.data[512]).toBe(0xbb);

		const sub = readDirectory(image, vol.entries[2].keyPointer);
		expect(sub.isVolume).toBe(false);
		expect(sub.entries.map((e) => e.name)).toEqual(["INNER"]);

		const owners = blockOwners(image, vol);
		expect(owners.get(2)).toBe("Volume directory");
		expect(owners.get(6)).toBe("Bitmap");
		expect(owners.get(8)).toBe("/BIG (index)");
		expect(owners.get(11)).toBe("/SUB");
		expect(owners.get(12)).toBe("/SUB/INNER");
	});

	it("takes the order from a .2mg header", () => {
		const image = prodosDisk("prodos");
		const file = new Uint8Array(64 + FLOPPY_SIZE);
		file.set(Array.from("2IMGTEST", (c) => c.charCodeAt(0)));
		file.set([64, 0, 1, 0, 1, 0, 0, 0], 0x08); // header 64, version 1, ProDOS order
		file.set([0x18, 0x01], 0x14); // 280 blocks
		file.set([64, 0, 0, 0, 0x00, 0x30, 0x02, 0x00], 0x18); // data at 64, 143360 bytes
		file.set(image.data, 64);
		const disk = analyzeDisk(file, "vol.2mg");
		expect(disk.orderSource).toBe("2mg header");
		expect(disk.header2mg?.creator).toBe("TEST");
		expect(disk.prodos?.name).toBe("TEST");
	});

	it("shows an unknown disk as raw sectors", () => {
		const disk = analyzeDisk(new Uint8Array(FLOPPY_SIZE), "game.dsk");
		expect(disk.format).toBe("unknown");
		expect(disk.image.order).toBe("dos");
		expect(disk.orderSource).toBe("extension");
	});
});

describe("apple2 format", () => {
	const open = (image: DiskImage, name: string, reading: string | null = null) => {
		const disk = apple2Format.open(image.data, name, reading);
		if (!disk) throw new Error("not opened");
		return disk;
	};

	it("DOS 3.3: the catalog is the root, files by catalog index, T/S in hex", () => {
		const disk = open(dos33Disk("dos"), "game.dsk");
		expect(disk.badge.label).toBe("DOS 3.3");
		expect(disk.home).toEqual({ kind: "dir", id: "catalog" });
		expect(disk.layout.tracks).toMatchObject({ first: 0, count: 35, hex: true });
		const dir = disk.readDir("catalog");
		expect(dir.title).toBe("Catalog · 1 files");
		expect(dir.entries.map((e) => [e.id, e.name.trim(), e.type, e.locked, e.deleted])).toEqual([
			["0", "HELLO", "B", true, false],
			["1", "OLD", "B", false, true],
		]);
		const hello = disk.readFile("0");
		expect(hello?.loaded).toEqual({ address: 0x0300, bytes: new Uint8Array([0xa9, 0xc1, 0x60, 0, 0]) });
		expect(hello?.groups.map((g) => [g.label, g.items.map((i) => i.label)])).toEqual([
			["T/S list", ["T12 SF"]],
			["Data", ["T12 SE", "T12 SD"]],
		]);
		expect(disk.ownerOfSector(0x11, 0)).toBe("VTOC");
		expect(disk.bootCode?.({ kind: "sector", track: 0, sector: 0 })).toEqual({ base: 0x800, skip: 1 });
	});

	it("ProDOS: directories and files by path, from the volume", () => {
		const disk = open(prodosDisk("prodos"), "vol.po");
		expect(disk.badge.label).toBe("ProDOS");
		expect(disk.root).toEqual({ id: "/TEST", label: "/TEST" });
		expect(disk.readDir("/TEST").entries.map((e) => [e.id, e.isDir])).toEqual([
			["/TEST/HELLO", false],
			["/TEST/BIG", false],
			["/TEST/SUB", true],
		]);
		expect(disk.readDir("/TEST/SUB").entries.map((e) => e.id)).toEqual(["/TEST/SUB/INNER"]);
		expect(disk.readFile("/TEST/SUB/INNER")?.loaded?.address).toBe(0x2000);
		expect(disk.readFile("/TEST/SUB")).toBeNull();
		expect(disk.readFile("/TEST/NOPE")).toBeNull();
		expect(disk.readDir("/OTHER").error).toBe("No such directory");
		expect(disk.ownerOfBlock(12)).toBe("/SUB/INNER");
	});

	it("the reading picks the sector order; unknown disks are raw sectors", () => {
		const forced = open(dos33Disk("dos"), "game.dsk", "prodos");
		expect(forced.reading?.autoLabel).toBe("Auto");
		// T$11 S0 (the VTOC) is in the same place in both orders, the file's sectors aren't
		expect(forced.readFile("0")?.loaded?.bytes).not.toEqual(
			open(dos33Disk("dos"), "game.dsk").readFile("0")?.loaded?.bytes,
		);
		const auto = open(dos33Disk("dos"), "game.dsk");
		expect(auto.reading?.autoLabel).toBe("Auto: DOS order (detected)");

		const raw = open(new DiskImage(new Uint8Array(FLOPPY_SIZE), "dos"), "blank.dsk");
		expect(raw.root).toBeUndefined();
		expect(raw.home).toEqual({ kind: "sector", track: 0, sector: 0 });
	});
});
