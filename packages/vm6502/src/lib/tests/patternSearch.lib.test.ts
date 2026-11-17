import { describe, expect, it } from "vitest";
import { type SearchRegion, searchPattern } from "@/lib/patternSearch.lib";

// Bank 0's RAM at 0, bank 1's at $10000; a ROM at $20000 seen at $F000-$FFFF in every bank.
const memory = new Uint8Array(0x30000);
const REGIONS: SearchRegion[] = [
	{ name: "RAM", base: 0x00000, start: 0x0000, end: 0xefff, banks: [0] },
	{ name: "RAM", base: 0x10000, start: 0x0000, end: 0xefff, banks: [1] },
	{ name: "ROM", base: 0x20000 - 0xf000, start: 0xf000, end: 0xffff },
];
const put = (offset: number, bytes: number[]) => memory.set(bytes, offset);
const search = (pattern: (number | null)[], start = 0, end = 0x1ffff, is7Bit = false, candidates?: number[][]) =>
	searchPattern(memory, REGIONS, pattern, start, end, is7Bit, candidates);

describe("searchPattern", () => {
	it("finds a pattern in each banked region, at its bank's address", () => {
		memory.fill(0);
		put(0x0300, [0xa9, 0x42]);
		put(0x10300, [0xa9, 0x42]);
		expect(search([0xa9, 0x42])).toEqual([
			{ address: 0x00300, location: "RAM" },
			{ address: 0x10300, location: "RAM" },
		]);
	});

	it("keeps to the range, and doesn't let a match cross its end", () => {
		memory.fill(0);
		put(0x0300, [0xa9, 0x42]);
		expect(search([0xa9, 0x42], 0x0301)).toEqual([]);
		expect(search([0xa9, 0x42], 0, 0x0300)).toEqual([]);
		expect(search([0xa9, 0x42], 0, 0x0301)).toEqual([{ address: 0x0300, location: "RAM" }]);
	});

	it("doesn't let a match cross a region's end", () => {
		memory.fill(0);
		put(0xefff, [0xa9, 0x42]); // $F000 is the ROM's, not the RAM's
		expect(search([0xa9, 0x42])).toEqual([]);
	});

	it("reports an unbanked region's match once, in the first bank of the range which has it", () => {
		memory.fill(0);
		put(0x20010, [0x4c, 0x00, 0xf0]); // ROM $F010
		expect(search([0x4c, 0x00, 0xf0], 0, 0xffffff)).toEqual([{ address: 0x0f010, location: "ROM" }]);
		expect(search([0x4c, 0x00, 0xf0], 0x0f020, 0xffffff)).toEqual([{ address: 0x1f010, location: "ROM" }]);
	});

	it("doesn't search the banks no region is in", () => {
		memory.fill(0);
		put(0x10300, [0xa9, 0x42]);
		expect(search([0xa9, 0x42], 0, 0xffffff)).toEqual([{ address: 0x10300, location: "RAM" }]);
	});

	it("takes any byte for a wildcard, or one of its candidates", () => {
		memory.fill(0);
		put(0x0300, [0xad, 0x00, 0xc0]); // LDA $C000
		put(0x0310, [0x8d, 0x00, 0xc0]); // STA $C000
		expect(search([null, 0x00, 0xc0], 0, 0xffff).map((m) => m.address)).toEqual([0x0300, 0x0310]);
		expect(search([null, 0x00, 0xc0], 0, 0xffff, false, [[0x8d]]).map((m) => m.address)).toEqual([0x0310]);
	});

	it("compares the low 7 bits only in 7-bit mode", () => {
		memory.fill(0);
		put(0x0400, [0xc8, 0xc9]); // "HI", high bit set
		expect(search([0x48, 0x49], 0, 0xffff)).toEqual([]);
		expect(search([0x48, 0x49], 0, 0xffff, true)).toEqual([{ address: 0x0400, location: "RAM" }]);
	});

	it("finds nothing for an empty pattern", () => {
		expect(search([])).toEqual([]);
	});
});
