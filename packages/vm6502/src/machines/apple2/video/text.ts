import { appleCharCodeToUnicode, GLYPH_MAPS, type GlyphSet } from "./charset";
import { IIgsPaletteRGB, NATIVE_VIEW_HEIGHT, NATIVE_VIEW_WIDTH, textScreenLineOffsets } from "./constants";

const TEXT_ROWS = 24;
const TEXT_COLS = 40;

const AUX_BANK_OFFSET = 0x10000;

const fontHeight = 16;
const font40Width = 14;

export class TextRenderer {
	// The BITMAP renderers' glyphs, from the main thread (generateApple2Assets)
	private glyphs40: GlyphSet | null = null;
	private glyphs80: GlyphSet | null = null;
	private flashCounter = 0;
	private flashState = false;
	// The FONT renderers wait for this: see setFontsReady
	private fontsReady = false;

	private offscreenCanvas: OffscreenCanvas;
	private ctx: OffscreenCanvasRenderingContext2D;
	private bufferWidth: number;
	private bufferHeight: number;

	constructor(
		private ram: Uint8Array,
		private dest: Uint8Array,
		private targetWidth: number,
		private targetHeight: number,
		payload: unknown,
	) {
		this.offscreenCanvas = new OffscreenCanvas(NATIVE_VIEW_WIDTH, NATIVE_VIEW_HEIGHT);
		const context = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Could not get 2D context from OffscreenCanvas");
		this.ctx = context as OffscreenCanvasRenderingContext2D;

		// test... not sure it's changing anything :/
		this.ctx.imageSmoothingEnabled = false;
		this.ctx.textRendering = "optimizeSpeed";

		this.bufferWidth = targetWidth;
		this.bufferHeight = targetHeight;

		const assets = payload as { glyphs40?: GlyphSet | null; glyphs80?: GlyphSet | null } | undefined;
		this.glyphs40 = assets?.glyphs40 ?? null;
		this.glyphs80 = assets?.glyphs80 ?? null;
	}

	/**
	 * The worker's fonts are loaded. Until then the FONT renderers draw nothing: setting ctx.font
	 * before the font is loaded makes the context resolve it to a fallback font, and it keeps that
	 * one even once the font is loaded (cached per context and font string).
	 */
	public setFontsReady() {
		this.fontsReady = true;
	}

	public tick() {
		this.flashCounter++;
		if (this.flashCounter >= 16) {
			this.flashState = !this.flashState;
			this.flashCounter = 0;
		}
	}

	public resize(width: number, height: number) {
		this.targetWidth = width;
		this.targetHeight = height;
	}

	public clear(fillStyle: string) {
		this.ctx.fillStyle = fillStyle;
		this.ctx.fillRect(0, 0, NATIVE_VIEW_WIDTH, NATIVE_VIEW_HEIGHT);
	}

	public getImageData() {
		return this.ctx.getImageData(0, 0, NATIVE_VIEW_WIDTH, NATIVE_VIEW_HEIGHT);
	}

	private findNearestColor(r: number, g: number, b: number): number {
		let minDist = Infinity;
		let bestIndex = 0;

		for (let i = 0; i < 16; i++) {
			const p = IIgsPaletteRGB[i] as [number, number, number];
			const dr = r - p[0];
			const dg = g - p[1];
			const db = b - p[2];
			const dist = dr * dr + dg * dg + db * db;

			if (dist < minDist) {
				minDist = dist;
				bestIndex = i;
				if (dist === 0) break;
			}
		}
		return bestIndex;
	}

	public copyToBuffer(options: { startRow: number; useThresholding: boolean; fgIdx: number; bgIdx: number }) {
		const { startRow, useThresholding, fgIdx, bgIdx } = options;

		const imageData = this.getImageData();
		const src32 = new Uint32Array(imageData.data.buffer);
		const srcWidth = imageData.width;
		const srcHeight = imageData.height;

		// Calculate centering offsets
		const destOffsetX = Math.floor((this.bufferWidth - srcWidth) / 2);
		const destOffsetY = Math.floor((this.bufferHeight - srcHeight) / 2);

		const colorCache = useThresholding ? null : new Map<number, number>();

		// When using font rendering, we combat anti-aliasing by snapping each pixel
		// to either the intended foreground, text background, or global background color.

		const globalBgIndex = 0;

		// biome-ignore lint/style/noNonNullAssertion: <p>
		const fgRgb = IIgsPaletteRGB[fgIdx]!;
		// biome-ignore lint/style/noNonNullAssertion: <p>
		const textBgRgb = IIgsPaletteRGB[bgIdx]!;
		// biome-ignore lint/style/noNonNullAssertion: <p>
		const globalBgRgb = IIgsPaletteRGB[globalBgIndex]!;

		const srcYStart = startRow * fontHeight;
		const srcYEnd = srcHeight;

		// Convert RGBA pixels to 8-bit indices
		// We loop over the SOURCE buffer dimensions (no scaling)
		for (let srcY = srcYStart; srcY < srcYEnd; srcY++) {
			const destY = srcY + destOffsetY;
			if (destY < 0 || destY >= this.targetHeight) continue;

			const srcRowOffset = srcY * srcWidth;
			const destRowOffset = destY * this.bufferWidth;

			for (let srcX = 0; srcX < srcWidth; srcX++) {
				const destX = srcX + destOffsetX;
				if (destX < 0 || destX >= this.targetWidth) continue;

				const pixel = src32[srcRowOffset + srcX] ?? 0;
				let colorIndex: number | undefined;

				if (useThresholding) {
					const r = pixel & 0xff;
					const g = (pixel >> 8) & 0xff;
					const b = (pixel >> 16) & 0xff;

					const distToGlobalBg =
						(r - globalBgRgb[0]) ** 2 + (g - globalBgRgb[1]) ** 2 + (b - globalBgRgb[2]) ** 2;
					const distToTextBg = (r - textBgRgb[0]) ** 2 + (g - textBgRgb[1]) ** 2 + (b - textBgRgb[2]) ** 2;
					const distToFg = (r - fgRgb[0]) ** 2 + (g - fgRgb[1]) ** 2 + (b - fgRgb[2]) ** 2;

					if (distToFg <= distToTextBg && distToFg <= distToGlobalBg) {
						colorIndex = fgIdx;
					} else if (distToTextBg <= distToGlobalBg) {
						colorIndex = bgIdx;
					} else {
						colorIndex = globalBgIndex;
					}
				} else {
					const key = pixel & 0x00ffffff;
					colorIndex = colorCache!.get(key);
					if (colorIndex === undefined) {
						const r = key & 0xff;
						const g = (key >> 8) & 0xff;
						const b = (key >> 16) & 0xff;
						colorIndex = this.findNearestColor(r, g, b);
						colorCache!.set(key, colorIndex);
					}
				}

				this.dest[destRowOffset + destX] = colorIndex;
			}
		}
	}

	/** The glyph table for the charset in use, at this point of the flash cycle */
	private glyphMap(isAltCharset: boolean) {
		if (isAltCharset) return GLYPH_MAPS.alt;
		return this.flashState ? GLYPH_MAPS.primaryInverse : GLYPH_MAPS.primaryNormal;
	}

	/**
	 * Writes a glyph's pixels as palette indices straight into the buffer, at (x, y) of the Apple
	 * picture (which is centered in the buffer, as copyToBuffer does).
	 */
	private blitGlyph(glyphs: GlyphSet, glyph: number, x: number, y: number, fgIdx: number, bgIdx: number) {
		const { width, height, masks } = glyphs;
		const stride = this.bufferWidth;
		const destX = x + Math.floor((this.bufferWidth - NATIVE_VIEW_WIDTH) / 2);
		const destY = y + Math.floor((this.bufferHeight - NATIVE_VIEW_HEIGHT) / 2);

		// Clipped to the buffer (a canvas smaller than the Apple picture)
		const c0 = Math.max(0, -destX);
		const c1 = Math.min(width, stride - destX);
		const r0 = Math.max(0, -destY);
		const r1 = Math.min(height, this.bufferHeight - destY);
		if (c0 >= c1 || r0 >= r1) return;

		let src = glyph * width * height + r0 * width;
		let dst = (destY + r0) * stride + destX;
		for (let r = r0; r < r1; r++) {
			for (let c = c0; c < c1; c++) this.dest[dst + c] = masks[src + c] ? fgIdx : bgIdx;
			src += width;
			dst += stride;
		}
	}

	public render40Bitmap(startRow: number, isPage2: boolean, bgIdx: number, fgIdx: number, isAltCharset: boolean) {
		const glyphs = this.glyphs40;
		if (!glyphs) return;
		const map = this.glyphMap(isAltCharset);
		const pageOffset = isPage2 ? 0x400 : 0;
		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = (textScreenLineOffsets[y] ?? 0) + pageOffset;
			const drawY = y * glyphs.height;
			for (let x = 0; x < TEXT_COLS; x++) {
				const glyph = map[this.ram[lineBase + x] ?? 0]!;
				this.blitGlyph(glyphs, glyph, x * glyphs.width, drawY, fgIdx, bgIdx);
			}
		}
	}

	public render80Bitmap(startRow: number, bgIdx: number, fgIdx: number, isAltCharset: boolean) {
		const glyphs = this.glyphs80;
		if (!glyphs) return;
		const map = this.glyphMap(isAltCharset);
		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = textScreenLineOffsets[y] ?? 0;
			const drawY = y * glyphs.height;
			for (let x = 0; x < TEXT_COLS; x++) {
				const drawX = x * 2 * glyphs.width;
				// Aux char (even column), then main char (odd column)
				const auxGlyph = map[this.ram[AUX_BANK_OFFSET + lineBase + x] ?? 0]!;
				this.blitGlyph(glyphs, auxGlyph, drawX, drawY, fgIdx, bgIdx);
				const mainGlyph = map[this.ram[lineBase + x] ?? 0]!;
				this.blitGlyph(glyphs, mainGlyph, drawX + glyphs.width, drawY, fgIdx, bgIdx);
			}
		}
	}

	public render40WithFont(startRow: number, isPage2: boolean, bgIdx: number, fgIdx: number, isAltCharset: boolean) {
		if (!this.fontsReady) return;
		this.ctx.font = `${fontHeight}px PrintChar21`;
		this.ctx.textBaseline = "top";
		this.ctx.textAlign = "left";

		const bgColorStr = `rgb(${IIgsPaletteRGB[bgIdx]!.join(",")})`;
		const fgColorStr = `rgb(${IIgsPaletteRGB[fgIdx]!.join(",")})`;

		const pageOffset = isPage2 ? 0x400 : 0;
		const wantNormal = !isAltCharset && !this.flashState;

		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = (textScreenLineOffsets[y] ?? 0) + pageOffset;
			const drawY = y * fontHeight;
			for (let x = 0; x < TEXT_COLS; x++) {
				let charCode = this.ram[lineBase + x] ?? 0;
				const drawX = x * font40Width;

				this.ctx.fillStyle = bgColorStr;
				this.ctx.fillRect(drawX, drawY, font40Width, fontHeight);

				if (wantNormal && charCode >= 0x40 && charCode <= 0x7f) charCode += 0x80;

				if (charCode === 0xa0) continue;

				this.ctx.fillStyle = fgColorStr;
				this.ctx.fillText(appleCharCodeToUnicode(charCode, isAltCharset), drawX, drawY);
			}
		}

		this.copyToBuffer({
			startRow,
			useThresholding: true,
			fgIdx,
			bgIdx,
		});
	}

	public render80WithFont(startRow: number, bgIdx: number, fgIdx: number, isAltCharset: boolean) {
		if (!this.fontsReady) return;
		const charWidth = 7;

		this.ctx.font = `${fontHeight}px PRNumber3`;
		this.ctx.textBaseline = "top";
		this.ctx.textAlign = "left";

		const bgColorStr = `rgb(${IIgsPaletteRGB[bgIdx]!.join(",")})`;
		const fgColorStr = `rgb(${IIgsPaletteRGB[fgIdx]!.join(",")})`;

		const wantNormal = !isAltCharset && !this.flashState;

		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = textScreenLineOffsets[y] ?? 0;
			const drawY = y * fontHeight;

			for (let x = 0; x < TEXT_COLS; x++) {
				const evenCharX = x * 2 * charWidth;
				const oddCharX = evenCharX + charWidth;

				this.ctx.fillStyle = bgColorStr;
				this.ctx.fillRect(evenCharX, drawY, charWidth * 2, fontHeight);
				this.ctx.fillStyle = fgColorStr;

				// Aux char (Even column)
				let auxVal = this.ram[AUX_BANK_OFFSET + lineBase + x] ?? 0;
				if (wantNormal && auxVal >= 0x40 && auxVal <= 0x7f) auxVal += 0x80;
				if (auxVal !== 0xa0) this.ctx.fillText(appleCharCodeToUnicode(auxVal, isAltCharset), evenCharX, drawY);

				// Main char (Odd column)
				let mainVal = this.ram[lineBase + x] ?? 0;
				if (wantNormal && mainVal >= 0x40 && mainVal <= 0x7f) mainVal += 0x80;
				if (mainVal !== 0xa0) this.ctx.fillText(appleCharCodeToUnicode(mainVal, isAltCharset), oddCharX, drawY);
			}
		}

		this.copyToBuffer({
			startRow,
			useThresholding: true,
			fgIdx,
			bgIdx,
		});
	}
}
