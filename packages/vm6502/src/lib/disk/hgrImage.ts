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
 * The picture held by `bytes` (offset 0 = the page's first byte; missing bytes are black), 280 x 192 RGBA.
 * Colors as the emulator's screen: a lone dot takes its column's color, two dots side by side are white,
 * a gap between two dots of the same color is filled with it.
 */
export function renderHgr(bytes: Uint8Array, mode: HgrMode = "color"): Uint8ClampedArray<ArrayBuffer> {
	const out = new Uint8ClampedArray(HGR_WIDTH * HGR_HEIGHT * 4);
	const at = (offset: number) => bytes[offset] ?? 0;

	for (let y = 0; y < HGR_HEIGHT; y++) {
		const line = hgrLineOffset(y);
		// The line's 280 dots, and the color group of the byte each one comes from
		const dots = new Uint8Array(HGR_WIDTH + 2); // a black dot on both sides
		const shifted = new Uint8Array(HGR_WIDTH);
		for (let col = 0; col < 40; col++) {
			const value = at(line + col);
			for (let bit = 0; bit < 7; bit++) {
				dots[1 + col * 7 + bit] = (value >> bit) & 1;
				shifted[col * 7 + bit] = value >> 7;
			}
		}

		for (let x = 0; x < HGR_WIDTH; x++) {
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
			const rgba = HGR_COLORS[color]!;
			out.set(rgba, (y * HGR_WIDTH + x) * 4);
		}
	}
	return out;
}
