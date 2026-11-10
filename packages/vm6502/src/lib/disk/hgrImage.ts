// An HGR picture (hi-res graphics page, 8K) as RGBA pixels, to look at a file or sectors as an image.
//
// 192 lines of 40 bytes, interleaved: line y starts at ((y & 7) << 10) | (((y >> 3) & 7) << 7) | ((y >> 6) * 40).
// Each byte gives 7 dots (bit 0 leftmost); bit 7 picks the color group (violet / green or blue / orange).
// A BSAVEd picture is often $1FF8 bytes: the last 8 bytes are an unseen screen hole.

import { HGR_COLORS } from "@/machines/apple2/video/hgr";

export const HGR_WIDTH = 280;
export const HGR_HEIGHT = 192;
export const HGR_SIZE = 0x2000;
/** The bytes that show: the last screen hole ($1FF8-$1FFF) doesn't */
export const HGR_VISIBLE_SIZE = 0x1ff8;

export type HgrMode = "color" | "mono";

/** Where line `y` starts in the page */
export const hgrLineOffset = (y: number) => ((y & 7) << 10) | (((y >> 3) & 7) << 7) | ((y >> 6) * 40);

const BLACK = 0;
const WHITE = 3;

/**
 * `lines` lines of `columns` bytes (7 dots each), `byteAt(y, col)` giving each byte, as RGBA.
 * Colors as the emulator's screen: a lone dot takes its column's color, two dots side by side are white,
 * a gap between two dots of the same color is filled with it.
 */
function renderLines(
	lines: number,
	columns: number,
	byteAt: (y: number, col: number) => number,
	mode: HgrMode,
): Uint8ClampedArray<ArrayBuffer> {
	const width = columns * 7;
	const out = new Uint8ClampedArray(width * lines * 4);
	// The line's dots (a black one on both sides), and the color group of the byte each one comes from
	const dots = new Uint8Array(width + 2);
	const shifted = new Uint8Array(width);

	for (let y = 0; y < lines; y++) {
		for (let col = 0; col < columns; col++) {
			const value = byteAt(y, col);
			for (let bit = 0; bit < 7; bit++) {
				dots[1 + col * 7 + bit] = (value >> bit) & 1;
				shifted[col * 7 + bit] = value >> 7;
			}
		}

		for (let x = 0; x < width; x++) {
			const on = dots[x + 1];
			let color: number;
			if (mode === "mono") color = on ? WHITE : BLACK;
			else {
				const prev = dots[x];
				const next = dots[x + 2];
				const even = x % 2 === 0;
				// Even columns: violet (2) or blue (6); odd ones: green (1) or orange (5)
				const natural = shifted[x] ? (even ? 6 : 5) : even ? 2 : 1;
				const opposite = shifted[x] ? (even ? 5 : 6) : even ? 1 : 2;
				if (on) color = prev || next ? WHITE : natural;
				else color = prev && next ? opposite : BLACK;
			}
			out.set(HGR_COLORS[color]!, (y * width + x) * 4);
		}
	}
	return out;
}

/** The picture held by `bytes` (offset 0 = the page's first byte; missing bytes are black), 280 x 192 RGBA. */
export function renderHgr(bytes: Uint8Array, mode: HgrMode = "color"): Uint8ClampedArray<ArrayBuffer> {
	return renderLines(HGR_HEIGHT, 40, (y, col) => bytes[hgrLineOffset(y) + col] ?? 0, mode);
}

/**
 * Bytes as consecutive rows of `columns` bytes, as sprites are stored (not interleaved as the screen), from
 * `offset`: `columns * 7` dots wide, as many rows as the bytes make (the last one completed with black).
 * Colors as at an even byte column of the screen.
 */
export function renderHgrRows(bytes: Uint8Array, columns: number, mode: HgrMode = "color", offset = 0) {
	const count = Math.max(0, bytes.length - offset);
	const rows = Math.ceil(count / columns);
	const rgba = renderLines(rows, columns, (y, col) => bytes[offset + y * columns + col] ?? 0, mode);
	return { rgba, width: columns * 7, height: rows };
}
