import { describe, expect, it } from "vitest";
import { MemorySearch, normalizeRanges } from "@/lib/memorySearch.lib";

const memory = new Uint8Array(0x20000);
const read = (address: number, length: number) => memory.slice(address, address + length);

describe("MemorySearch", () => {
	it("starts with every byte of the ranges as a candidate", () => {
		memory.fill(0);
		const search = new MemorySearch(
			[
				{ start: 0x300, end: 0x30f },
				{ start: 0x10300, end: 0x10307 },
			],
			read,
		);
		expect(search.count).toBe(24);
		expect(search.size).toBe(24);
		expect(search.list(read, 2)).toEqual([
			{ address: 0x300, previous: 0, value: 0 },
			{ address: 0x301, previous: 0, value: 0 },
		]);
	});

	it("narrows round after round, the kept values becoming the reference", () => {
		memory.fill(0);
		memory[0x305] = 3; // lives
		memory[0x308] = 3; // something else at 3
		const search = new MemorySearch([{ start: 0x300, end: 0x30f }], read);

		expect(search.filter({ kind: "equals", value: 3 }, read, 10)).toEqual([
			{ address: 0x305, previous: 3, value: 3 },
			{ address: 0x308, previous: 3, value: 3 },
		]);

		memory[0x305] = 2; // a life lost
		memory[0x308] = 1;
		expect(search.filter({ kind: "decreased", by: 1 }, read, 10)).toEqual([
			{ address: 0x305, previous: 3, value: 2 },
		]);
		expect(search.rounds).toBe(2);

		// the reference is now 2: unchanged keeps it
		expect(search.filter({ kind: "unchanged" }, read, 10)).toHaveLength(1);
		memory[0x305] = 7;
		expect(search.list(read, 10)).toEqual([{ address: 0x305, previous: 2, value: 7 }]);
	});

	it("compares modulo 256 with `by`, unsigned without", () => {
		memory.fill(0);
		memory.set([0x00, 0xff, 0x10], 0x300);
		const search = new MemorySearch([{ start: 0x300, end: 0x302 }], read);
		memory.set([0xff, 0x00, 0x20], 0x300);
		const fromOld = () => new MemorySearch([{ start: 0x300, end: 0x302 }], () => Uint8Array.of(0x00, 0xff, 0x10));

		expect(
			fromOld()
				.filter({ kind: "decreased", by: 1 }, read, 9)
				.map((c) => c.address),
		).toEqual([0x300]);
		expect(
			fromOld()
				.filter({ kind: "increased", by: 1 }, read, 9)
				.map((c) => c.address),
		).toEqual([0x301]);
		expect(
			fromOld()
				.filter({ kind: "increased" }, read, 9)
				.map((c) => c.address),
		).toEqual([0x300, 0x302]);
		expect(
			fromOld()
				.filter({ kind: "decreased" }, read, 9)
				.map((c) => c.address),
		).toEqual([0x301]);
		expect(search.filter({ kind: "changed" }, read, 9)).toHaveLength(3);
		expect(search.filter({ kind: "not_equals", value: 0 }, read, 9).map((c) => c.address)).toEqual([0x300, 0x302]);
	});

	it("lists at most `limit` but keeps them all", () => {
		memory.fill(0);
		const search = new MemorySearch([{ start: 0, end: 0xbfff }], read);
		memory.fill(1, 0x1000, 0x1100);
		expect(search.filter({ kind: "changed" }, read, 5)).toHaveLength(5);
		expect(search.count).toBe(0x100);
	});
});

describe("normalizeRanges", () => {
	it("sorts, rejects reversed and overlapping ranges", () => {
		expect(
			normalizeRanges([
				{ start: 0x800, end: 0x8ff },
				{ start: 0, end: 0xff },
			]),
		).toEqual([
			{ start: 0, end: 0xff },
			{ start: 0x800, end: 0x8ff },
		]);
		expect(() => normalizeRanges([{ start: 2, end: 1 }])).toThrow(/before/);
		expect(() =>
			normalizeRanges([
				{ start: 0, end: 0x10 },
				{ start: 0x10, end: 0x20 },
			]),
		).toThrow(/overlap/);
	});
});
