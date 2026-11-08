import type { TextScreenOptions } from "@/types/bus.interface";
import { textScreenLineOffsets } from "./constants";

// Apple II text screen as plain text: 24 rows of 40 bytes, interleaved in memory (textScreenLineOffsets).
// 80 columns interleave aux (even columns) and main (odd columns) at the same addresses.

/** Debug reads of aux memory: bank 1 ($1xxxx). */
const AUX_BANK = 0x10000;
const PAGE2_OFFSET = 0x400;

/**
 * Screen code to character. Inverse and flashing are shown as normal characters;
 * $FF (DEL, a checkerboard on the //e) as a space.
 */
export const decodeTextChar = (c: number) => {
	let v = c & 0x7f;
	if (c < 0x80) v = c & 0x3f; // inverse ($00-$3F) and flashing ($40-$7F)
	if (v < 0x20) v += 0x40; // @ A-Z [ \ ] ^ _
	return v === 0x7f ? " " : String.fromCharCode(v);
};

/** One string per row, trailing spaces trimmed. `readRange` is a side-effect-free memory read. */
export function readTextScreen(
	readRange: (address: number, length: number) => Uint8Array,
	{ page = 1, cols = 40 }: TextScreenOptions = {},
): string[] {
	const pageOffset = page === 2 ? PAGE2_OFFSET : 0;
	return textScreenLineOffsets.map((offset) => {
		const base = offset + pageOffset;
		const main = readRange(base, 40);
		const aux = cols === 80 ? readRange(AUX_BANK + base, 40) : undefined;
		let line = "";
		for (let col = 0; col < 40; col++) {
			if (aux) line += decodeTextChar(aux[col] ?? 0xa0);
			line += decodeTextChar(main[col] ?? 0xa0);
		}
		return line.trimEnd();
	});
}
