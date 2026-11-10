import { describe, expect, it } from "vitest";
import { hgrLineOffset } from "@/lib/disk/hgrImage";
import { detectHgrRle, expandRle, type RleLayout, type RleOrder, unpackHgrRle } from "@/lib/disk/hgrRle";

/** A level-like picture, `lines` high: floors, posts, a violet hill */
function picture(lines: number) {
	const at = (x: number, y: number) => {
		if (y % 40 < 3) return 0x7f;
		if (x % 8 === 3 && y % 40 > 10) return 0x1c;
		if (y > lines - 30 + 12 * Math.sin(x / 5)) return x % 2 ? 0x55 : 0x2a;
		if ((x * 7 + y * 3) % 23 === 0) return 0x08;
		return 0;
	};
	return Array.from({ length: lines }, (_, y) => Array.from({ length: 40 }, (_, x) => at(x, y)));
}

/** Packs as the 6502 unpacker reads it: runs of 4+ (and any $FE) as FE value count */
function pack(grid: number[][], layout: RleLayout, order: RleOrder) {
	const lines = grid.length;
	const seq =
		layout === "columns"
			? Array.from({ length: 40 * lines }, (_, k) => grid[k % lines]![Math.floor(k / lines)]!)
			: grid.flat();
	const out: number[] = [];
	for (let i = 0; i < seq.length;) {
		let j = i;
		while (j < seq.length && seq[j] === seq[i] && j - i < 255) j++;
		const [value, count] = [seq[i]!, j - i];
		if (count >= 4 || value === 0xfe) out.push(0xfe, ...(order === "valueCount" ? [value, count] : [count, value]));
		else out.push(...seq.slice(i, j));
		i = j;
	}
	return new Uint8Array(out);
}

const pageOf = (grid: number[][]) => {
	const page = new Uint8Array(0x2000);
	grid.forEach((row, y) => page.set(row, hgrLineOffset(y)));
	return page;
};

describe("expandRle", () => {
	it("copies bytes, repeats runs, a count of 0 being 256", () => {
		const bytes = new Uint8Array([1, 0xfe, 7, 3, 2, 0xfe, 9, 0]);
		const { stream, used } = expandRle(bytes, "valueCount");
		expect(Array.from(stream.subarray(0, 6))).toEqual([1, 7, 7, 7, 2, 9]);
		expect(stream.length).toBe(5 + 256);
		expect(used).toBe(8);
		expect(Array.from(expandRle(new Uint8Array([0xfe, 3, 7]), "countValue").stream)).toEqual([7, 7, 7]);
	});

	it("stops at the limit", () => {
		const { stream, used } = expandRle(new Uint8Array([0xfe, 1, 200, 5, 6]), "valueCount", 10);
		expect(stream.length).toBe(10);
		expect(used).toBe(3);
	});
});

describe("unpackHgrRle", () => {
	it("fills the screen column by column, or line by line", () => {
		const grid = picture(183);
		for (const layout of ["columns", "lines"] as const) {
			const packed = pack(grid, layout, "valueCount");
			const { page, used } = unpackHgrRle(packed, { order: "valueCount", layout, lines: 183 });
			expect(page).toEqual(pageOf(grid));
			expect(used).toBe(packed.length);
		}
	});
});

describe("detectHgrRle", () => {
	it.each([
		["columns", "valueCount", 183],
		["columns", "countValue", 183],
		["columns", "valueCount", 192],
		["lines", "valueCount", 192],
		["lines", "countValue", 160],
	] as const)("finds a picture packed by %s, %s, %i lines", (layout, order, lines) => {
		const grid = picture(lines);
		// something else follows the picture, as in a file
		const packed = new Uint8Array([
			...pack(grid, layout, order),
			...Array.from({ length: 300 }, (_, i) => (i * 37) & 0xff),
		]);
		const found = detectHgrRle(packed);
		expect(found?.variant.layout).toBe(layout);
		expect(found?.variant.order).toBe(order);
		const page = pageOf(grid);
		if (layout === "columns") {
			expect(found?.variant.lines).toBe(lines);
			expect(found?.page).toEqual(page);
		} else {
			// line by line, what follows the picture shows below it: the picture's lines are right
			for (let y = 0; y < lines; y++) {
				const at = hgrLineOffset(y);
				expect(found?.page.subarray(at, at + 40)).toEqual(page.subarray(at, at + 40));
			}
		}
	});

	it("doesn't take code or text for a picture", () => {
		const code = new Uint8Array(
			Array.from({ length: 3000 }, (_, i) => [0xa9, 0xfe, 0x8d, 0x00, 0x20, 0x20, 0xed, 0xfd][i % 8]! ^ (i >> 5)),
		);
		expect(detectHgrRle(code)).toBeNull();
		expect(detectHgrRle(new Uint8Array(2000).fill(0xc1))).toBeNull();
	});
});
