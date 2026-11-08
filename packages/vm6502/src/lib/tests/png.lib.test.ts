import { describe, expect, it } from "vitest";
import { bytesToBase64, crc32, encodeIndexedPng } from "@/lib/png.lib";
import { cropVideoBuffer, grayscalePalette } from "@/virtualmachine/video/video.output";

type Chunk = { type: string; data: Uint8Array; crcOk: boolean };

const readChunks = (png: Uint8Array) => {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	const chunks: Chunk[] = [];
	for (let at = 8; at < png.length;) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
		const data = png.subarray(at + 8, at + 8 + length);
		const crcOk = view.getUint32(at + 8 + length) === crc32(png.subarray(at + 4, at + 8 + length));
		chunks.push({ type, data, crcOk });
		at += 12 + length;
	}
	return chunks;
};

const inflate = async (data: Uint8Array) => {
	const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
};

describe("encodeIndexedPng", () => {
	it("writes an 8-bit indexed PNG: signature, IHDR, PLTE, IDAT rows with filter 0, IEND, valid CRCs", async () => {
		const palette = new Uint8Array(256 * 4);
		palette.set([0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 128]); // black, red, green (alpha ignored)
		const pixels = Uint8Array.from([0, 1, 2, 2, 1, 0]); // 3x2

		const png = await encodeIndexedPng(3, 2, pixels, palette);

		expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const chunks = readChunks(png);
		expect(chunks.map((c) => c.type)).toEqual(["IHDR", "PLTE", "IDAT", "IEND"]);
		expect(chunks.every((c) => c.crcOk)).toBe(true);

		const ihdr = new DataView(chunks[0]!.data.buffer, chunks[0]!.data.byteOffset, 13);
		expect([ihdr.getUint32(0), ihdr.getUint32(4)]).toEqual([3, 2]);
		expect([...chunks[0]!.data.subarray(8)]).toEqual([8, 3, 0, 0, 0]);

		expect(chunks[1]!.data.length).toBe(256 * 3);
		expect([...chunks[1]!.data.subarray(0, 9)]).toEqual([0, 0, 0, 255, 0, 0, 0, 255, 0]);

		expect([...(await inflate(chunks[2]!.data))]).toEqual([0, 0, 1, 2, 0, 2, 1, 0]);
	});

	it("rejects a bad size or too few pixels", async () => {
		await expect(encodeIndexedPng(0, 2, new Uint8Array(4), grayscalePalette())).rejects.toThrow("bad size");
		await expect(encodeIndexedPng(4, 4, new Uint8Array(4), grayscalePalette())).rejects.toThrow("pixels");
	});
});

describe("cropVideoBuffer", () => {
	it("copies the rect, row after row", () => {
		// 4x3 buffer, values = index
		const buffer = Uint8Array.from({ length: 12 }, (_, i) => i);
		expect([...cropVideoBuffer(buffer, 4, { x: 1, y: 1, width: 2, height: 2 })]).toEqual([5, 6, 9, 10]);
		expect([...cropVideoBuffer(buffer, 4, { x: 0, y: 0, width: 4, height: 3 })]).toEqual([...buffer]);
	});
});

describe("bytesToBase64", () => {
	it("encodes like btoa, also past a chunk boundary", () => {
		expect(bytesToBase64(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe("iVBORw==");
		const big = Uint8Array.from({ length: 0x8000 + 3 }, (_, i) => i & 0xff);
		expect(atob(bytesToBase64(big)).length).toBe(big.length);
	});
});
