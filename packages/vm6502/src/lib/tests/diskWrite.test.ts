import { describe, expect, it } from "vitest";
import { analyzeDisk } from "@/lib/disk/formats/apple2/analyzeDisk";
import { apple2Format } from "@/lib/disk/formats/apple2/apple2.format";
import { DiskImage, FLOPPY_SIZE } from "@/lib/disk/formats/apple2/diskImage";
import { readBitmap, readDirectory, readFile } from "@/lib/disk/formats/apple2/prodos";
import { addFile, fileBlocks, formatVolume, prodosName } from "@/lib/disk/formats/apple2/prodos.write";

const bytes = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 7 + (i >> 9)) & 0xff);
const file = (name: string, length: number, fileType = 0x06, auxType = 0x2000) => ({
	name,
	data: bytes(length),
	fileType,
	auxType,
	locked: false,
});
const freeBlocks = (image: DiskImage) => readBitmap(image, readDirectory(image))?.freeBlocks;

describe("ProDOS names", () => {
	it("upper case, periods for the rest, a letter first, 15 at most", () => {
		expect(prodosName("hello world")).toBe("HELLO.WORLD");
		expect(prodosName("1984")).toBe("F1984");
		expect(prodosName("  -- MY GAME (SIDE A) --")).toBe("MY.GAME.SIDE.A");
		expect(prodosName("A VERY LONG FILE NAME")).toBe("A.VERY.LONG.FIL");
	});
});

describe("ProDOS volume", () => {
	it("a blank 140K volume: empty directory, blocks 0-6 used", () => {
		const image = new DiskImage(formatVolume(280, "new disk"), "prodos");
		const volume = readDirectory(image);
		expect(volume).toMatchObject({ name: "NEW.DISK", isVolume: true, totalBlocks: 280, bitmapPointer: 6 });
		expect(volume.blocks).toEqual([2, 3, 4, 5]);
		expect(volume.entries).toEqual([]);
		expect(freeBlocks(image)).toBe(280 - 7);
		const disk = apple2Format.open(image.data, "new.po", null);
		expect(disk?.badge.label).toBe("ProDOS");
	});

	it("a 32MB volume: a 16 block bitmap", () => {
		const image = new DiskImage(formatVolume(65535, "HD"), "prodos");
		expect(readBitmap(image, readDirectory(image))?.blocks).toHaveLength(16);
		expect(freeBlocks(image)).toBe(65535 - 6 - 16);
	});

	it("boot blocks copied", () => {
		const boot = bytes(1024);
		const data = formatVolume(280, "B", new Date(), boot);
		expect(data.subarray(0, 1024)).toEqual(boot);
	});
});

describe("ProDOS addFile", () => {
	it("seedling, sapling and tree files read back, blocks taken from the bitmap", () => {
		const image = new DiskImage(formatVolume(1600, "T"), "prodos");
		const sizes = [0, 100, 512, 513, 128 * 1024, 128 * 1024 + 1, 300 * 1024];
		sizes.forEach((size, i) => addFile(image, 2, file(`F${i}`, size)));
		const volume = readDirectory(image);
		expect(volume.fileCount).toBe(sizes.length);
		expect(volume.entries.map((e) => e.storageType)).toEqual([1, 1, 1, 2, 2, 3, 3]);
		volume.entries.forEach((entry, i) => {
			expect(entry).toMatchObject({ fileType: 0x06, auxType: 0x2000, eof: sizes[i], access: 0xe3 });
			expect(entry.blocksUsed).toBe(fileBlocks(sizes[i] as number).total);
			expect(readFile(image, entry).data).toEqual(bytes(sizes[i] as number));
		});
		const used = sizes.reduce((sum, size) => sum + fileBlocks(size).total, 0);
		expect(freeBlocks(image)).toBe(1600 - 7 - used);
	});

	it("writes through the sector order of a DOS-ordered floppy", () => {
		const prodosOrder = new DiskImage(formatVolume(280, "D"), "prodos");
		const dosOrder = new DiskImage(new Uint8Array(FLOPPY_SIZE), "dos");
		for (let b = 0; b < 280; b++) dosOrder.writeBlock(b, prodosOrder.readBlock(b));
		addFile(dosOrder, 2, file("CODE", 2000));
		const disk = analyzeDisk(dosOrder.data, "d.dsk");
		expect(disk.image.order).toBe("dos");
		expect(readFile(disk.image, disk.prodos!.entries[0]!).data).toEqual(bytes(2000));
	});

	it("refuses a name already there, a full disk, a full volume directory; writes nothing then", () => {
		const image = new DiskImage(formatVolume(280, "T"), "prodos");
		addFile(image, 2, file("A", 10));
		const before = image.data.slice();
		expect(() => addFile(image, 2, file("a", 10))).toThrow(/already/);
		expect(() => addFile(image, 2, file("BIG", 200 * 1024))).toThrow(/blocks needed/);
		expect(image.data).toEqual(before);
		for (let i = 1; i < 51; i++) addFile(image, 2, file(`F${i}`, 0));
		expect(() => addFile(image, 2, file("ONE.MORE", 0))).toThrow(/full/);
	});

	it("a full subdirectory grows a block, its entry in the parent updated", () => {
		const image = new DiskImage(formatVolume(280, "T"), "prodos");
		// A subdirectory by hand: key block 7, an entry in the volume directory
		const key = image.readBlock(7).slice();
		key.fill(0);
		key[4] = 0xe3;
		key.set(
			[..."SUB"].map((c) => c.charCodeAt(0)),
			5,
		);
		key[4 + 0x10] = 0x75;
		key.set([0x27, 0x0d], 4 + 0x1f);
		key.set([2, 0, 2, 0x27], 4 + 0x23); // parent block 2, entry 2 (the header is 1)
		image.writeBlock(7, key);
		const vol = image.readBlock(2).slice();
		vol.set(
			[0xd3, ..."SUB"].map((c) => (typeof c === "number" ? c : c.charCodeAt(0))),
			4 + 0x27,
		);
		vol.set([0x0f, 7, 0, 1, 0, 0, 2, 0], 4 + 0x27 + 0x10); // DIR, key 7, 1 block, EOF $200
		vol[4 + 0x21] = 1;
		image.writeBlock(2, vol);
		const bitmap = image.readBlock(6).slice();
		bitmap[0] &= ~0x01; // block 7 used
		image.writeBlock(6, bitmap);

		for (let i = 0; i < 13; i++) addFile(image, 7, file(`F${i}`, 0));
		const sub = readDirectory(image, 7);
		expect(sub.blocks).toHaveLength(2);
		expect(sub.entries).toHaveLength(13);
		expect(sub.fileCount).toBe(13);
		expect(readDirectory(image).entries[0]).toMatchObject({ name: "SUB", blocksUsed: 2, eof: 1024 });
	});
});

describe("apple2 format: new disks, copying", () => {
	it("creates a ProDOS volume with the boot blocks of another disk", () => {
		const boot = formatVolume(280, "SRC", new Date(), bytes(1024));
		const data = apple2Format.create!("prodos800k", "my disk", { file: boot, name: "src.po" });
		expect(data.length).toBe(1600 * 512);
		expect(data.subarray(0, 1024)).toEqual(bytes(1024));
		expect(apple2Format.volumeName!("my disk")).toBe("MY.DISK");
	});

	it("copies files from a ProDOS disk to another, in a directory the target lists", () => {
		const src = new DiskImage(formatVolume(280, "SRC"), "prodos");
		addFile(src, 2, { ...file("GAME", 3000, 0x06, 0x4000), locked: true });
		const from = apple2Format.open(src.data, "src.po", null)!;
		const copy = from.exportFile!("/SRC/GAME")!;
		expect(copy).toMatchObject({ name: "GAME", fileType: 0x06, auxType: 0x4000, locked: true });

		const dst = formatVolume(280, "DST");
		const to = apple2Format.open(dst, "dst.po", null)!;
		expect(to.target!.dirs()).toEqual([{ id: "/DST", label: "/DST" }]);
		expect(to.target!.addFiles("/DST", [copy, copy])).toEqual([
			{ from: "GAME", to: "/DST/GAME" },
			{ from: "GAME", error: "GAME is already in the directory" },
		]);
		const reopened = apple2Format.open(dst, "dst.po", null)!;
		expect(reopened.readFile("/DST/GAME")?.data).toEqual(bytes(3000));
	});

	it("a DOS 3.3 disk is read only", () => {
		const blank = apple2Format.open(new Uint8Array(FLOPPY_SIZE), "x.dsk", null)!;
		expect(blank.target).toBeUndefined();
		expect(blank.readOnlyReason).toMatch(/No file system/);
	});
});
