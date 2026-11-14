/**
 * The //e character set, shared by the text renderers (worker) and the glyph atlas (main thread).
 *
 * PrintChar21 / PRNumber3 hold every glyph of the //e video ROM: the normal ones at their ASCII
 * code points, the inverse / flashing / mouse text ones in the private use area ($E000-$E15F).
 */
export function appleCharCodeToUnicode(charCode: number, isAltCharset = false): string {
	if (charCode <= 0x1f) charCode += 0xe140;
	else if (charCode <= 0x3f) charCode += 0xe100;
	else if (charCode <= 0x5f) {
		charCode += isAltCharset ? 0xe040 : 0xe100;
	} else if (charCode <= 0x7f) charCode += 0xe0c0; // $60-$7F -> $E120-$E13F
	else if (charCode < 0xa0) charCode -= 0x40;
	else if (charCode >= 0xa0) charCode -= 0x80;

	return String.fromCharCode(charCode);
}

/** One cell per glyph, one byte per pixel (1: lit), glyph after glyph, row after row */
export type GlyphSet = {
	width: number;
	height: number;
	masks: Uint8Array;
};

// The glyphs of the "Bitmap" renderer: the 256 codes of the primary charset, then the alt charset's
// $40-$5F (mouse text), the only codes where both charsets differ
export const ALT_GLYPH_BASE = 256;
export const GLYPH_COUNT = ALT_GLYPH_BASE + 0x20;

export const TEXT_CELL_40 = { width: 14, height: 16 };
export const TEXT_CELL_80 = { width: 7, height: 16 };

export function glyphChar(glyph: number): string {
	return glyph < ALT_GLYPH_BASE
		? appleCharCodeToUnicode(glyph, false)
		: appleCharCodeToUnicode(0x40 + glyph - ALT_GLYPH_BASE, true);
}

/**
 * Screen code -> glyph, for each state of the charset. Same choices as the "Font" renderer:
 * - primary, flash phase off: $40-$7F (flashing) shown as their normal glyph ($C0-$FF)
 * - primary, flash phase on: $40-$7F shown as is (inverse)
 * - alt: $40-$5F are mouse text, no flashing
 */
function buildGlyphMaps() {
	const primaryNormal = new Uint16Array(256);
	const primaryInverse = new Uint16Array(256);
	const alt = new Uint16Array(256);
	for (let code = 0; code < 256; code++) {
		const isFlashing = code >= 0x40 && code <= 0x7f;
		primaryNormal[code] = isFlashing ? code + 0x80 : code;
		primaryInverse[code] = code;
		alt[code] = code >= 0x40 && code <= 0x5f ? ALT_GLYPH_BASE + code - 0x40 : code;
	}
	return { primaryNormal, primaryInverse, alt };
}

export const GLYPH_MAPS = buildGlyphMaps();
