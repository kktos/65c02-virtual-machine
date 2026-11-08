// Minimal PNG encoder for the video output: an 8-bit indexed image (colour type 3), which is exactly
// what the video buffer is (palette indices + a 256-colour palette). No dependency: the zlib stream
// comes from CompressionStream("deflate"), available in browsers, workers and Node.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

export function crc32(bytes: Uint8Array) {
	let c = 0xffffffff;
	for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** length + type + data + CRC (of type + data) */
function chunk(type: string, data: Uint8Array) {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

async function zlibDeflate(data: Uint8Array<ArrayBuffer>) {
	const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * PNG of a `width` x `height` image of palette indices (row-major), with `palette` in RGBA
 * (4 bytes per entry, at most 256 entries; the alpha is ignored: the picture is opaque).
 */
export async function encodeIndexedPng(width: number, height: number, pixels: Uint8Array, palette: Uint8Array) {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
		throw new Error(`png: bad size ${width}x${height}`);
	if (pixels.length < width * height) throw new Error(`png: ${pixels.length} pixels for ${width}x${height}`);
	const colors = Math.min(256, Math.floor(palette.length / 4));
	if (colors < 1) throw new Error("png: empty palette");

	const ihdr = new Uint8Array(13);
	const ihdrView = new DataView(ihdr.buffer);
	ihdrView.setUint32(0, width);
	ihdrView.setUint32(4, height);
	ihdr.set([8, 3, 0, 0, 0], 8); // bit depth 8, indexed colour, deflate, adaptive filtering, no interlace

	const plte = new Uint8Array(colors * 3);
	for (let i = 0; i < colors; i++) plte.set(palette.subarray(i * 4, i * 4 + 3), i * 3);

	// Every row starts with its filter type: 0 (none); runs of equal pixels compress well as they are
	const raw = new Uint8Array(height * (width + 1));
	for (let row = 0; row < height; row++)
		raw.set(pixels.subarray(row * width, (row + 1) * width), row * (width + 1) + 1);

	const parts = [
		Uint8Array.from(PNG_SIGNATURE),
		chunk("IHDR", ihdr),
		chunk("PLTE", plte),
		chunk("IDAT", await zlibDeflate(raw)),
		chunk("IEND", new Uint8Array(0)),
	];
	const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const p of parts) {
		png.set(p, offset);
		offset += p.length;
	}
	return png;
}

export function bytesToBase64(bytes: Uint8Array) {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}
