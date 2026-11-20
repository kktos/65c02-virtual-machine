import { describe, expect, it } from "vitest";
import { type AppleDisplayMode, appleScreenToAddress } from "../video/screen.locate";

const mode = (m: Partial<AppleDisplayMode>): AppleDisplayMode => ({
	isText: false,
	isHgr: false,
	isMixed: false,
	is80Col: false,
	isPage2: false,
	isDblRes: false,
	...m,
});
const at = (m: Partial<AppleDisplayMode>, x: number, y: number) => appleScreenToAddress(mode(m), x, y);

describe("appleScreenToAddress", () => {
	it("is undefined outside the 560x384 picture", () => {
		expect(at({ isText: true }, -1, 0)).toBeUndefined();
		expect(at({ isText: true }, 560, 0)).toBeUndefined();
		expect(at({ isText: true }, 0, 384)).toBeUndefined();
	});

	it("TEXT40: 14x16 cells through the row interleave, page 2 at $800", () => {
		expect(at({ isText: true }, 0, 0)).toMatchObject({ address: 0x400, label: "TEXT1 row 0 · col 0" });
		// Row 8 is at $428, col 39 is the last pixel column
		expect(at({ isText: true }, 559, 8 * 16 + 15)?.address).toBe(0x428 + 39);
		expect(at({ isText: true, isPage2: true }, 14, 16)?.address).toBe(0x880 + 1);
	});

	it("TEXT80: 7-pixel cells, aux first, page 2 ignored", () => {
		expect(at({ isText: true, is80Col: true }, 0, 0)).toMatchObject({
			address: 0x10400,
			label: "TEXT80 row 0 · col 0 (aux)",
		});
		expect(at({ isText: true, is80Col: true, isPage2: true }, 7, 0)?.address).toBe(0x400);
		expect(at({ isText: true, is80Col: true }, 559, 0)?.address).toBe(0x400 + 39);
	});

	it("HGR: 2x2 dots, byte and bit, page 2 at $4000", () => {
		expect(at({ isHgr: true }, 0, 0)).toMatchObject({ address: 0x2000, label: "HGR1 line 0 · byte 0 · bit 0" });
		// Dot 20 = byte 2 bit 6; line 1 is at $2400
		expect(at({ isHgr: true }, 41, 3)).toMatchObject({ address: 0x2402, label: "HGR1 line 1 · byte 2 · bit 6" });
		expect(at({ isHgr: true, isPage2: true }, 0, 383)?.address).toBe(0x5fd0);
	});

	it("DHGR: 7-dot bytes alternating aux and main", () => {
		const dhgr = { isHgr: true, isDblRes: true, is80Col: true };
		expect(at(dhgr, 3, 0)).toMatchObject({ address: 0x12000, label: "DHGR line 0 · byte 0 (aux) · bit 3" });
		expect(at(dhgr, 7, 0)?.address).toBe(0x2000);
		expect(at(dhgr, 14, 0)?.address).toBe(0x12001);
		// DBLRES without 80COL is plain HGR
		expect(at({ isHgr: true, isDblRes: true }, 14, 0)?.address).toBe(0x2001);
	});

	it("GR: the low nibble on top, the high one below", () => {
		expect(at({}, 14, 0)).toMatchObject({ address: 0x401, label: "GR1 line 0 · col 1 · top" });
		expect(at({}, 14, 8)).toMatchObject({ address: 0x401, label: "GR1 line 1 · col 1 · bottom" });
		expect(at({ isPage2: true }, 0, 16)?.address).toBe(0x880);
	});

	it("double GR: aux first", () => {
		expect(at({ isDblRes: true }, 0, 0)?.address).toBe(0x10400);
		expect(at({ isDblRes: true }, 7, 0)?.address).toBe(0x400);
	});

	it("mixed: the last 4 rows are text", () => {
		expect(at({ isHgr: true, isMixed: true }, 0, 319)?.label).toMatch(/^HGR1/);
		expect(at({ isHgr: true, isMixed: true }, 0, 320)).toMatchObject({
			address: 0x650,
			label: "TEXT1 row 20 · col 0",
		});
		expect(at({ isMixed: true }, 0, 320)?.address).toBe(0x650);
	});
});
