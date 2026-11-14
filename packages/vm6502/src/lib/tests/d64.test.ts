import { describe, expect, it } from "vitest";
import { D64Image, directoryListing, sectorsPerTrack } from "@/lib/disk/d64";
import { buildD64 } from "./d64Builder";

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => (from + i) & 0xff);

describe("D64Image", () => {
	it("takes the 35 / 40 track sizes, with or without error bytes, and nothing else", () => {
		expect(new D64Image(new Uint8Array(174848)).tracks).toBe(35);
		expect(new D64Image(new Uint8Array(175531)).tracks).toBe(35);
		expect(new D64Image(new Uint8Array(196608)).tracks).toBe(40);
		expect(new D64Image(new Uint8Array(197376)).tracks).toBe(40);
		expect(() => new D64Image(new Uint8Array(143360))).toThrow("Not a D64 image: 143360 bytes");
	});

	it("lays out the speed zones: 683 sectors on 35 tracks", () => {
		const image = new D64Image(new Uint8Array(174848));
		expect([1, 17, 18, 24, 25, 30, 31, 35].map(sectorsPerTrack)).toEqual([21, 21, 19, 19, 18, 18, 17, 17]);
		expect(image.linearSector(1, 0)).toBe(0);
		expect(image.linearSector(18, 0)).toBe(357);
		expect(image.linearSector(35, 16)).toBe(682);
		expect(image.linearSector(1, 21)).toBe(-1);
		expect(image.sector(0, 0)).toBeNull();
		expect(image.sector(36, 0)).toBeNull();
	});

	it("reads the disk name, ID, free blocks and the directory", () => {
		const image = new D64Image(
			buildD64({
				name: "GAMES",
				id: "G1",
				files: [
					{ name: "HELLO", data: range(10) },
					{ name: "NOTES", data: range(300), typeByte: 0x81 },
					{ name: "LOCKED", data: [1], typeByte: 0xc2 },
					{ name: "SPLAT", data: [1], typeByte: 0x02 },
				],
			}),
		);
		expect(text(image.diskName)).toBe("GAMES");
		expect(text(image.idAndDosType)).toBe("G1\xa02A");
		expect(image.blocksFree).toBe(664 - 5);
		expect(
			image
				.directory()
				.map(({ name, type, closed, locked, blocks }) => [text(name), type, closed, locked, blocks]),
		).toEqual([
			["HELLO", "PRG", true, false, 1],
			["NOTES", "SEQ", true, false, 2],
			["LOCKED", "PRG", true, true, 1],
			["SPLAT", "PRG", false, false, 1],
		]);
	});

	it("follows the directory over several sectors", () => {
		const files = range(20).map((i) => ({ name: `FILE${i}`, data: [i] }));
		const image = new D64Image(buildD64({ files }));
		expect(image.directory().map((e) => text(e.name))).toEqual(files.map((f) => f.name));
	});

	it("reads a file's chain of sectors, the last one up to its end offset", () => {
		const data = range(600, 7);
		const image = new D64Image(buildD64({ files: [{ name: "BIG", data }] }));
		const [entry] = image.directory();
		const read = image.readChain(entry?.track as number, entry?.sector as number);
		expect([...read.data]).toEqual(data);
		expect(read.sectors).toEqual([0, 1, 2]);
		expect(read.broken).toBe(false);
	});

	it("stops on a chain that loops or links nowhere", () => {
		const bytes = buildD64({ files: [{ name: "BAD", data: range(600) }] });
		const image = new D64Image(bytes);
		bytes.set([1, 0], 256); // sector 1 links back to sector 0
		expect(image.readChain(1, 0)).toMatchObject({ sectors: [0, 1], broken: true });
		bytes.set([99, 0], 256);
		const read = image.readChain(1, 0);
		expect(read).toMatchObject({ sectors: [0, 1], broken: true });
		expect(read.data.length).toBe(508);
	});
});

describe("directoryListing", () => {
	it("is a BASIC program at $0401: the header in reverse, a line per file, the blocks free", () => {
		const image = new D64Image(
			buildD64({
				name: "GAMES",
				id: "G1",
				files: [
					{ name: "HELLO", data: range(10) },
					{ name: "SPLAT", data: [1], typeByte: 0x01 },
					{ name: "BIG", data: range(254 * 120), typeByte: 0xc2 },
				],
			}),
		);
		const bytes = directoryListing(image);
		expect([bytes[0], bytes[1]]).toEqual([0x01, 0x04]);

		// Walk the lines by their links, as BASIC does
		const lines: [number, string][] = [];
		let at = 2;
		let address = 0x0401;
		while (bytes[at] || bytes[at + 1]) {
			const link = (bytes[at] as number) | ((bytes[at + 1] as number) << 8);
			const number = (bytes[at + 2] as number) | ((bytes[at + 3] as number) << 8);
			const end = bytes.indexOf(0, at + 4);
			lines.push([number, text(bytes.subarray(at + 4, end))]);
			expect(link).toBe(address + (end + 1 - at));
			address = link;
			at = end + 1;
		}
		expect(lines).toEqual([
			[0, '\x12"GAMES           " G1 2A'],
			[1, '   "HELLO"            PRG '],
			[1, '   "SPLAT"           *SEQ '],
			[120, ' "BIG"              PRG<'],
			[664 - 122, "BLOCKS FREE."],
		]);
		expect(at).toBe(bytes.length - 2);
	});

	it("keeps the files the pattern matches", () => {
		const image = new D64Image(
			buildD64({
				files: [
					{ name: "A1", data: [1] },
					{ name: "B1", data: [1] },
				],
			}),
		);
		const bytes = directoryListing(image, 0, (name) => name[0] === 0x42);
		expect(text(bytes)).toContain('"B1"');
		expect(text(bytes)).not.toContain('"A1"');
	});
});
