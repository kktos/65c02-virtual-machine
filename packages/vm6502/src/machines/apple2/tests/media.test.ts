// Inserting / ejecting a disk in the SmartPort card (slot 5) through the bus, as the worker does.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiskImage, FLOPPY_SIZE, type SectorOrder } from "@/lib/disk/formats/apple2/diskImage";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";

type Card = { diskData: Uint8Array | null; handleRead(paramAddr: number): number };

/** A 140K ProDOS volume in `order`: a volume header in block 2 (the boot block looks for it), `fill` in block 5. */
function prodosFloppy(order: SectorOrder, fill = 0x5a) {
	const image = new DiskImage(new Uint8Array(FLOPPY_SIZE), order);
	const writeBlock = (block: number, bytes: Uint8Array) => {
		const [lo, hi] = image.blockSectors(block);
		image.data.set(bytes.subarray(0, 256), image.sectorOffset(lo.track, lo.sector));
		image.data.set(bytes.subarray(256), image.sectorOffset(hi.track, hi.sector));
	};
	const volume = new Uint8Array(512);
	volume.set([0xf4, ...Array.from("TEST", (c) => c.charCodeAt(0))], 4); // storage $F, name length 4
	volume.set([0x27, 0x0d, 0, 0, 6, 0, 0x18, 0x01], 4 + 0x1f); // entry length/count, bitmap at 6, 280 blocks
	volume[511] = 0xee; // last byte: the 2nd sector of the block
	writeBlock(2, volume);
	writeBlock(5, new Uint8Array(512).fill(fill));
	return image.data;
}

describe("AppleBus media", () => {
	let bus: AppleBus;
	let card: Card;

	beforeEach(() => {
		vi.stubGlobal("self", { postMessage: () => undefined });
		vi.stubGlobal("performance", { now: () => 0 });
		bus = new AppleBus(new Uint8Array(apple2e.memory.size));
		card = (bus as unknown as { slots: Card[] }).slots[5]!;
	});

	/** READ block `block` to $2000 through the card, as ProDOS calls it (params at $42). */
	const readBlock = (block: number) => {
		[0x01, 0x50, 0x00, 0x20, block & 0xff, block >> 8].forEach((byte, i) => bus.write(0x42 + i, byte));
		expect(card.handleRead(0x42)).toBe(0);
		return Array.from({ length: 512 }, (_, i) => bus.read(0x2000 + i));
	};

	it("ejectMedia empties the drive inserted with insertMedia", () => {
		bus.insertMedia(new Uint8Array(512), { slot: 5, name: "a.po" });
		expect(card.diskData).toHaveLength(512);
		bus.ejectMedia({ slot: 5 });
		expect(card.diskData).toBeNull();
	});

	it.each([
		["vol.dsk", "dos"],
		["vol.po", "prodos"],
		["vol.dsk", "prodos"], // a .dsk holding a ProDOS-ordered image: found where the volume is
	] as const)("reads the blocks of %s in %s order", (name, order) => {
		bus.insertMedia(prodosFloppy(order), { slot: 5, name });
		const block2 = readBlock(2);
		expect(block2.slice(4, 9)).toEqual([0xf4, 0x54, 0x45, 0x53, 0x54]); // $F4 "TEST"
		expect(block2[511]).toBe(0xee);
		expect(readBlock(5).every((b) => b === 0x5a)).toBe(true);
	});

	it("skips a .2mg header to the data offset it gives", () => {
		const data = prodosFloppy("dos");
		const file = new Uint8Array(80 + FLOPPY_SIZE);
		file.set(Array.from("2IMGTEST", (c) => c.charCodeAt(0)));
		file.set([80, 0, 1, 0, 0, 0, 0, 0], 0x08); // header 80 bytes, version 1, DOS order
		file.set([80, 0, 0, 0, 0x00, 0x30, 0x02, 0x00], 0x18); // data at 80, 143360 bytes
		file.set(data, 80);
		bus.insertMedia(file, { slot: 5, name: "vol.2mg" });
		expect(card.diskData).toHaveLength(FLOPPY_SIZE);
		expect(readBlock(2)[511]).toBe(0xee);
	});
});
