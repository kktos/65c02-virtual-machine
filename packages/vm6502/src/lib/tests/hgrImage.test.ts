import { describe, expect, it } from "vitest";
import { HGR_HEIGHT, HGR_WIDTH, hgrLineOffset, renderHgr, renderHgrRows } from "@/lib/disk/hgrImage.utils";
import { HGR_COLORS } from "@/machines/apple2/video/hgr";

const pixel = (rgba: Uint8ClampedArray, x: number, y: number) =>
	Array.from(rgba.subarray((y * HGR_WIDTH + x) * 4, (y * HGR_WIDTH + x) * 4 + 4));

const [BLACK, GREEN, VIOLET, WHITE, , ORANGE, BLUE] = HGR_COLORS;

/** A page with the given bytes at line `y`, from column `col` */
const page = (y: number, col: number, values: number[]) => {
	const bytes = new Uint8Array(0x2000);
	bytes.set(values, hgrLineOffset(y) + col);
	return bytes;
};

describe("hgrLineOffset", () => {
	it("interleaves the lines as the Apple II does", () => {
		expect([0, 1, 7, 8, 63, 64, 128, 191].map(hgrLineOffset)).toEqual([
			0x0000, 0x0400, 0x1c00, 0x0080, 0x1f80, 0x0028, 0x0050, 0x1fd0,
		]);
	});
});

describe("renderHgr", () => {
	it("is 280 x 192 RGBA, black for an empty (or short) page", () => {
		const rgba = renderHgr(new Uint8Array(10));
		expect(rgba.length).toBe(HGR_WIDTH * HGR_HEIGHT * 4);
		expect(pixel(rgba, 0, 0)).toEqual(BLACK);
		expect(pixel(rgba, 279, 191)).toEqual(BLACK);
	});

	it("colors a lone dot by its column and the byte's bit 7", () => {
		// line 5, column 2: dots 14 (even) and 16 (even); then bit 7 set: blue
		let rgba = renderHgr(page(5, 2, [0b0000101]));
		expect(pixel(rgba, 14, 5)).toEqual(VIOLET);
		expect(pixel(rgba, 16, 5)).toEqual(VIOLET);
		rgba = renderHgr(page(5, 2, [0x80 | 0b0000101]));
		expect(pixel(rgba, 14, 5)).toEqual(BLUE);
		// odd dots: green, orange with bit 7
		expect(pixel(renderHgr(page(0, 0, [0b10])), 1, 0)).toEqual(GREEN);
		expect(pixel(renderHgr(page(0, 0, [0x82])), 1, 0)).toEqual(ORANGE);
	});

	it("fills the gap between two dots of the same color, whitens dots side by side", () => {
		const rgba = renderHgr(page(0, 0, [0b0000101]));
		expect(pixel(rgba, 1, 0)).toEqual(VIOLET);
		expect(pixel(renderHgr(page(0, 0, [0b11])), 0, 0)).toEqual(WHITE);
	});

	it("links the dots across bytes", () => {
		// bit 6 of column 0 (dot 6) and bit 0 of column 1 (dot 7): side by side, white
		const rgba = renderHgr(page(0, 0, [0x40, 0x01]));
		expect(pixel(rgba, 6, 0)).toEqual(WHITE);
		expect(pixel(rgba, 7, 0)).toEqual(WHITE);
	});

	it("mono: a dot is white, whatever its color", () => {
		const rgba = renderHgr(page(0, 0, [0x81]), "mono");
		expect(pixel(rgba, 0, 0)).toEqual(WHITE);
		expect(pixel(rgba, 1, 0)).toEqual(BLACK);
	});
});

describe("renderHgrRows", () => {
	const at = (r: { rgba: Uint8ClampedArray; width: number }, x: number, y: number) =>
		Array.from(r.rgba.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4));

	it("lays the bytes out as rows of `columns` bytes, one after the other", () => {
		// 2 bytes wide: row 0 = $01 $00 (dot 0), row 1 = $00 $40 (dot 13), row 2 = $03 (dots 0-1) and a missing byte
		const sprite = renderHgrRows(new Uint8Array([0x01, 0x00, 0x00, 0x40, 0x03]), 2);
		expect([sprite.width, sprite.height]).toEqual([14, 3]);
		expect(at(sprite, 0, 0)).toEqual(VIOLET);
		expect(at(sprite, 13, 1)).toEqual(GREEN);
		expect(at(sprite, 0, 2)).toEqual(WHITE);
		expect(at(sprite, 13, 2)).toEqual(BLACK);
	});

	it("skips bytes before the first row", () => {
		const sprite = renderHgrRows(new Uint8Array([0xff, 0xff, 0x01]), 1, "mono", 2);
		expect([sprite.width, sprite.height]).toEqual([7, 1]);
		expect(at(sprite, 0, 0)).toEqual(WHITE);
		expect(at(sprite, 1, 0)).toEqual(BLACK);
	});

	it("nothing left: no rows", () => {
		expect(renderHgrRows(new Uint8Array(2), 3, "color", 2).height).toBe(0);
	});
});
