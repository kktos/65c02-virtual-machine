import { IIgsPaletteRGB, NATIVE_VIEW_HEIGHT, NATIVE_VIEW_WIDTH, textScreenLineOffsets } from "./constants";

const TEXT_ROWS = 24;
const TEXT_COLS = 40;

const AUX_BANK_OFFSET = 0x10000;

const fontHeight = 16;
const font40Width = 14;

export type CharMetrics = {
	charWidth: number;
	charHeight: number;
	cols: number;
	rows: number;
	offsetTop: number;
	offsetLeft: number;
};

function appleCharCodeToUnicode(charCode: number, isAltCharset = false): string {
	// let charCode = asciiCode;
	if (charCode <= 0x1f) charCode += 0xe140;
	else if (charCode <= 0x3f) charCode += 0xe100;
	else if (charCode <= 0x5f) {
		charCode += isAltCharset ? 0xe040 : 0xe100;
	} else if (charCode <= 0x7f)
		charCode += 0xe0c0; // $60-$7F -> $E120-$E13F
	else if (charCode < 0xa0) charCode -= 0x40;
	else if (charCode >= 0xa0) charCode -= 0x80;

	return String.fromCharCode(charCode);
}

export class TextRenderer {
	private charWidth: number;
	private charHeight: number;
	private charmap40: ImageBitmap | null = null;
	private metrics40: CharMetrics | null = null;
	private charmap80: ImageBitmap | null = null;
	private metrics80: CharMetrics | null = null;
	private flashCounter = 0;
	private flashState = false;

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

		this.charWidth = 14;
		this.charHeight = 16;

		const assets = payload as {
			charmap40?: ImageBitmap;
			metrics40?: CharMetrics;
			charmap80?: ImageBitmap;
			metrics80?: CharMetrics;
		};
		if (assets) {
			this.charmap40 = assets.charmap40 ?? null;
			this.metrics40 = assets.metrics40 ?? null;
			this.charmap80 = assets.charmap80 ?? null;
			this.metrics80 = assets.metrics80 ?? null;
		}
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
				let colorIndex: number;

				if (useThresholding) {
					const r = pixel & 0xff;
					const g = (pixel >> 8) & 0xff;
					const b = (pixel >> 16) & 0xff;

					const distToGlobalBg = (r - globalBgRgb[0]) ** 2 + (g - globalBgRgb[1]) ** 2 + (b - globalBgRgb[2]) ** 2;
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

	private drawChar(charmap: ImageBitmap | null, metrics: CharMetrics | null, charCode: number, x: number, y: number, width: number, height: number) {
		if (!charmap || !metrics) return;

		// Calculate source position in atlas (simple math, very fast)
		const col = charCode % metrics.cols;
		const row = Math.floor(charCode / metrics.rows);

		const srcX = col * metrics.charWidth;
		const srcY = row * metrics.charHeight;

		// Draw from atlas
		this.ctx.drawImage(
			charmap,
			srcX,
			srcY,
			metrics.charWidth,
			metrics.charHeight, // source
			x,
			y,
			width,
			height, // destination
		);
	}

	public render40Bitmap(startRow: number, isPage2: boolean, _bgIdx: number, _fgIdx: number, _isAltCharset: boolean) {
		const pageOffset = isPage2 ? 0x400 : 0;
		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = (textScreenLineOffsets[y] ?? 0) + pageOffset;
			for (let x = 0; x < TEXT_COLS; x++) {
				const charCode = this.ram[lineBase + x] ?? 0;

				const drawX = x * this.charWidth;
				const drawY = y * this.charHeight;

				this.drawChar(this.charmap40, this.metrics40, charCode, drawX, drawY, this.charWidth, this.charHeight);
			}
		}
	}

	public render80Bitmap(startRow: number, _bgIdx: number, _fgIdx: number, _isAltCharset: boolean) {
		const charWidth80 = this.charWidth / 2;
		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = textScreenLineOffsets[y] ?? 0;
			for (let x = 0; x < TEXT_COLS; x++) {
				const drawY = y * this.charHeight;

				// Aux char (Even column)
				const auxVal = this.ram[AUX_BANK_OFFSET + lineBase + x] ?? 0;
				const drawXAux = x * 2 * charWidth80;
				this.drawChar(this.charmap80, this.metrics80, auxVal, drawXAux, drawY, charWidth80, this.charHeight);

				// Main char (Odd column)
				const mainVal = this.ram[lineBase + x] ?? 0;
				const drawXMain = (x * 2 + 1) * charWidth80;
				this.drawChar(this.charmap80, this.metrics80, mainVal, drawXMain, drawY, charWidth80, this.charHeight);
			}
		}
	}

	public render40WithFont(startRow: number, isPage2: boolean, bgIdx: number, fgIdx: number, isAltCharset: boolean) {
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
