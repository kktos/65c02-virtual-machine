// HGR pictures packed with a run-length encoding: $FE starts a run, any other byte is copied as is.
//
//   FE value count   (or FE count value)   a run: `count` times `value`, a count of 0 being 256 (a 6502 DEC loop)
//   xx               a byte of the picture
//
// The bytes unpacked fill the screen either column by column (40 columns of `lines` bytes, top to bottom then the
// next column: Conan's backgrounds, 183 lines) or line by line (40 bytes per line). Nothing in the data says which
// variant it is, nor how many lines: detectHgrRle() tries them and keeps the one whose picture holds together.

import { HGR_SIZE, hgrLineOffset } from "./hgrImage";

export const RLE_MARKER = 0xfe;

export type RleOrder = "valueCount" | "countValue";
export type RleLayout = "columns" | "lines";
export type RleVariant = { order: RleOrder; layout: RleLayout; lines: number };

export type RlePicture = {
	variant: RleVariant;
	/** The HGR page (8K, offset 0 = $2000) */
	page: Uint8Array;
	/** Packed bytes read to fill it */
	used: number;
};

const MAX_LINES = 192;
const COLUMNS = 40;
/** The fewest lines a picture is looked for with (a picture smaller than half a screen isn't guessed) */
const MIN_LINES = 96;
/** How much sharper the picture is at its size than around it, to be taken for a picture */
const MIN_SCORE = 0.02;

/** The bytes packed in `bytes` up to `limit` of them, and how many packed bytes it took. */
export function expandRle(bytes: Uint8Array, order: RleOrder, limit = COLUMNS * MAX_LINES) {
	const out = new Uint8Array(limit);
	let n = 0;
	let i = 0;
	while (i < bytes.length && n < limit) {
		const b = bytes[i]!;
		if (b !== RLE_MARKER) {
			out[n++] = b;
			i++;
			continue;
		}
		if (i + 2 >= bytes.length) break;
		const value = order === "valueCount" ? bytes[i + 1]! : bytes[i + 2]!;
		const count = (order === "valueCount" ? bytes[i + 2]! : bytes[i + 1]!) || 256;
		const end = Math.min(n + count, limit);
		out.fill(value, n, end);
		n = end;
		i += 3;
	}
	return { stream: out.subarray(0, n), used: i };
}

/** Puts unpacked bytes on an HGR page, as the variant's layout says */
function layOut(stream: Uint8Array, layout: RleLayout, lines: number) {
	const page = new Uint8Array(HGR_SIZE);
	const count = Math.min(stream.length, COLUMNS * lines);
	for (let k = 0; k < count; k++) {
		const x = layout === "columns" ? Math.floor(k / lines) : k % COLUMNS;
		const y = layout === "columns" ? k % lines : Math.floor(k / COLUMNS);
		page[hgrLineOffset(y) + x] = stream[k]!;
	}
	return page;
}

export function unpackHgrRle(bytes: Uint8Array, variant: RleVariant): RlePicture {
	const lines = Math.min(Math.max(Math.round(variant.lines), 1), MAX_LINES);
	const { stream, used } = expandRle(bytes, variant.order, COLUMNS * lines);
	return { variant: { ...variant, lines }, page: layOut(stream, variant.layout, lines), used };
}

/** How often a byte equals the one `lag` bytes before it, over the first `n` bytes */
function sameAt(stream: Uint8Array, n: number, lag: number) {
	const end = Math.min(n, stream.length);
	if (end <= lag) return 0;
	let same = 0;
	for (let i = lag; i < end; i++) if (stream[i] === stream[i - lag]) same++;
	return same / (end - lag);
}

/**
 * How much the bytes `lag` apart (the same dot 2 bytes to the left, or the line above) look alike, compared to a
 * few bytes off: a picture laid out at the right size has a sharp peak there. Two bytes to the left rather than
 * one: HGR colors alternate between even and odd bytes.
 */
const peak = (stream: Uint8Array, n: number, lag: (delta: number) => number) =>
	sameAt(stream, n, lag(0)) - [-4, -3, 3, 4].reduce((sum, d) => sum + sameAt(stream, n, lag(d)), 0) / 4;

/** The variant `bytes` look packed with, unpacked; null if they don't look like a packed picture. */
export function detectHgrRle(bytes: Uint8Array): RlePicture | null {
	if (!bytes.includes(RLE_MARKER)) return null;

	let best: { variant: RleVariant; score: number } | null = null;
	const consider = (variant: RleVariant, score: number) => {
		if (!best || score > best.score) best = { variant, score };
	};

	for (const order of ["valueCount", "countValue"] as const) {
		const { stream } = expandRle(bytes, order);
		// Column by column: the byte on the left is `lines` bytes before, the one 2 bytes left `2 * lines`
		for (let lines = MIN_LINES; lines <= MAX_LINES; lines++) {
			const n = COLUMNS * lines;
			if (stream.length < n) break;
			consider(
				{ order, layout: "columns", lines },
				peak(stream, n, (d) => 2 * (lines + d)),
			);
		}
		// Line by line: the line above is 40 bytes before
		const lines = Math.min(MAX_LINES, Math.floor(stream.length / COLUMNS));
		if (lines >= MIN_LINES)
			consider(
				{ order, layout: "lines", lines },
				peak(stream, COLUMNS * lines, (d) => COLUMNS + d),
			);
	}

	const found = best as { variant: RleVariant; score: number } | null;
	if (!found || found.score < MIN_SCORE) return null;
	return unpackHgrRle(bytes, found.variant);
}
