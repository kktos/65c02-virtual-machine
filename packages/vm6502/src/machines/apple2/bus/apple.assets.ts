import { GLYPH_COUNT, type GlyphSet, glyphChar, TEXT_CELL_40, TEXT_CELL_80 } from "../video/charset";

/**
 * Renders every glyph of a font once, the way the "Font" text renderer draws it (same size,
 * top-left aligned), and keeps its pixels as a 1-bit mask: the "Bitmap" text renderer only copies
 * those, with no canvas involved.
 */
function buildGlyphSet(font: string, width: number, height: number): GlyphSet | null {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;

	ctx.font = font;
	ctx.textBaseline = "top";
	ctx.textAlign = "left";
	ctx.fillStyle = "white";

	const cellSize = width * height;
	const masks = new Uint8Array(GLYPH_COUNT * cellSize);
	for (let glyph = 0; glyph < GLYPH_COUNT; glyph++) {
		ctx.clearRect(0, 0, width, height);
		ctx.fillText(glyphChar(glyph), 0, 0);
		const pixels = ctx.getImageData(0, 0, width, height).data;
		const base = glyph * cellSize;
		// Alpha only: anti-aliased edges go to whichever side they are closer to
		for (let i = 0; i < cellSize; i++) masks[base + i] = pixels[i * 4 + 3]! >= 0x80 ? 1 : 0;
	}
	return { width, height, masks };
}

export async function generateApple2Assets(): Promise<{ video?: unknown; bus?: unknown }> {
	if (typeof document === "undefined") return {};

	const font40 = `${TEXT_CELL_40.height}px PrintChar21`;
	const font80 = `${TEXT_CELL_80.height}px PRNumber3`;
	await Promise.all([document.fonts.load(font40), document.fonts.load(font80)]);
	if (!document.fonts.check(font40) || !document.fonts.check(font80))
		console.warn("Apple2 assets: text fonts not loaded, the Bitmap text renderer will use a fallback font");

	return {
		video: {
			glyphs40: buildGlyphSet(font40, TEXT_CELL_40.width, TEXT_CELL_40.height),
			glyphs80: buildGlyphSet(font80, TEXT_CELL_80.width, TEXT_CELL_80.height),
		},
	};
}
