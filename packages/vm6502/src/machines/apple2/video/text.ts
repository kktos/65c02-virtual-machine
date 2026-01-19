import { NATIVE_VIEW_HEIGHT, NATIVE_VIEW_WIDTH, SCREEN_MARGIN_X, SCREEN_MARGIN_Y } from "./constants";

const TEXT_ROWS = 24;
const TEXT_COLS = 40;

const AUX_BANK_OFFSET = 0x10000;

const font40Height = 16;
const font40Width = 14;

export type CharMetrics = {
	charWidth: number;
	charHeight: number;
	cols: number;
	rows: number;
	offsetTop: number;
	offsetLeft: number;
};

// Offsets for each of the 24 lines in the text screen memory
// Includes the Text Page 1 Base ($400)
const textScreenLineOffsets = [
	0x400, 0x480, 0x500, 0x580, 0x600, 0x680, 0x700, 0x780, 0x428, 0x4a8, 0x528, 0x5a8, 0x628, 0x6a8, 0x728, 0x7a8, 0x450,
	0x4d0, 0x550, 0x5d0, 0x650, 0x6d0, 0x750, 0x7d0,
];

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
	private textScaleY: number;
	private textScaleX: number;

	public wannaScale: boolean = false;
	public offsetX = 0;
	public offsetY = 0;
	public scaleX = 1;
	public scaleY = 1;

	constructor(
		private ctx: OffscreenCanvasRenderingContext2D,
		private ram: Uint8Array,
		payload: unknown,
		private targetWidth: number,
		private targetHeight: number,
	) {
		const screenAreaWidth = targetWidth - SCREEN_MARGIN_X * 2;
		const screenAreaHeight = targetHeight - SCREEN_MARGIN_Y * 2;
		this.charWidth = screenAreaWidth / TEXT_COLS;
		this.charHeight = screenAreaHeight / TEXT_ROWS;

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
		this.textScaleY = Math.min(targetWidth / NATIVE_VIEW_WIDTH, targetHeight / NATIVE_VIEW_HEIGHT);
		this.textScaleX = targetWidth / NATIVE_VIEW_WIDTH;
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
		const screenAreaWidth = width - SCREEN_MARGIN_X * 2;
		const screenAreaHeight = height - SCREEN_MARGIN_Y * 2;
		this.charWidth = screenAreaWidth / TEXT_COLS;
		this.charHeight = screenAreaHeight / TEXT_ROWS;
		this.textScaleY = Math.min(width / NATIVE_VIEW_WIDTH, height / NATIVE_VIEW_HEIGHT);
		this.textScaleX = width / NATIVE_VIEW_WIDTH;
	}

	private drawChar(
		charmap: ImageBitmap | null,
		metrics: CharMetrics | null,
		charCode: number,
		x: number,
		y: number,
		width: number,
		height: number,
	) {
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

	public render40Bitmap(startRow: number, isPage2: boolean) {
		this.offsetX = SCREEN_MARGIN_X;
		this.offsetY = SCREEN_MARGIN_Y;
		this.scaleX = 1;
		this.scaleY = 1;

		const pageOffset = isPage2 ? 0x400 : 0;
		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = (textScreenLineOffsets[y] ?? 0) + pageOffset;
			for (let x = 0; x < TEXT_COLS; x++) {
				const charCode = this.ram[lineBase + x] ?? 0;

				const drawX = SCREEN_MARGIN_X + x * this.charWidth;
				const drawY = SCREEN_MARGIN_Y + y * this.charHeight;

				this.drawChar(this.charmap40, this.metrics40, charCode, drawX, drawY, this.charWidth, this.charHeight);
			}
		}
	}

	public render80Bitmap(startRow: number) {
		this.offsetX = SCREEN_MARGIN_X;
		this.offsetY = SCREEN_MARGIN_Y;
		this.scaleX = 1;
		this.scaleY = 1;

		const charWidth80 = this.charWidth / 2;
		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = textScreenLineOffsets[y] ?? 0;
			for (let x = 0; x < TEXT_COLS; x++) {
				const drawY = SCREEN_MARGIN_Y + y * this.charHeight;

				// Aux char (Even column)
				const auxVal = this.ram[AUX_BANK_OFFSET + lineBase + x] ?? 0;
				const drawXAux = SCREEN_MARGIN_X + x * 2 * charWidth80;
				this.drawChar(this.charmap80, this.metrics80, auxVal, drawXAux, drawY, charWidth80, this.charHeight);

				// Main char (Odd column)
				const mainVal = this.ram[lineBase + x] ?? 0;
				const drawXMain = SCREEN_MARGIN_X + (x * 2 + 1) * charWidth80;
				this.drawChar(this.charmap80, this.metrics80, mainVal, drawXMain, drawY, charWidth80, this.charHeight);
			}
		}
	}

	public render40WithFont(
		startRow: number,
		isPage2: boolean,
		bgColorStr: string,
		fgColorStr: string,
		isAltCharset: boolean,
	) {
		this.ctx.font = `${font40Height}px PrintChar21`;
		this.ctx.textBaseline = "top";
		this.ctx.textAlign = "left";

		this.scaleY = this.wannaScale ? this.textScaleY : 1;
		this.scaleX = this.wannaScale ? this.textScaleX : 1;
		const scaledWidth = NATIVE_VIEW_WIDTH * this.scaleX;
		const scaledHeight = NATIVE_VIEW_HEIGHT * this.scaleY;
		this.offsetX = (this.targetWidth - scaledWidth) / 2;
		this.offsetY = (this.targetHeight - scaledHeight) / 2;

		this.ctx.save();
		this.ctx.translate(this.offsetX, this.offsetY);
		if (this.wannaScale) this.ctx.scale(this.scaleX, this.scaleY);

		const pageOffset = isPage2 ? 0x400 : 0;
		const wantNormal = !isAltCharset && !this.flashState;

		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = (textScreenLineOffsets[y] ?? 0) + pageOffset;
			const drawY = y * font40Height;
			for (let x = 0; x < TEXT_COLS; x++) {
				let charCode = this.ram[lineBase + x] ?? 0;
				const drawX = x * font40Width;

				this.ctx.fillStyle = bgColorStr;
				this.ctx.fillRect(drawX, drawY, font40Width, font40Height);

				if (wantNormal && charCode >= 0x40 && charCode <= 0x7f) charCode += 0x80;

				if (charCode === 0xa0) continue;

				this.ctx.fillStyle = fgColorStr;
				this.ctx.fillText(appleCharCodeToUnicode(charCode, isAltCharset), drawX, drawY);
			}
		}
		this.ctx.restore();
	}

	public render80WithFont(startRow: number, bgColorStr: string, fgColorStr: string, isAltCharset: boolean) {
		const charHeight = 16;
		const charWidth = 7;

		this.ctx.font = `${charHeight}px PRNumber3`;
		this.ctx.textBaseline = "top";
		this.ctx.textAlign = "left";

		const textBlockWidth = TEXT_COLS * 2 * charWidth;
		const textBlockHeight = TEXT_ROWS * charHeight;
		const scale = this.wannaScale
			? Math.min(this.targetWidth / textBlockWidth, this.targetHeight / textBlockHeight)
			: 1;
		this.scaleX = scale;
		this.scaleY = scale;
		const scaledWidth = textBlockWidth * this.scaleX;
		const scaledHeight = textBlockHeight * this.scaleY;
		this.offsetX = (this.targetWidth - scaledWidth) / 2;
		this.offsetY = (this.targetHeight - scaledHeight) / 2;

		this.ctx.save();
		this.ctx.translate(this.offsetX, this.offsetY);
		if (this.wannaScale) this.ctx.scale(this.scaleX, this.scaleY);

		const wantNormal = !isAltCharset && !this.flashState;

		for (let y = startRow; y < TEXT_ROWS; y++) {
			const lineBase = textScreenLineOffsets[y] ?? 0;
			const drawY = y * charHeight;

			for (let x = 0; x < TEXT_COLS; x++) {
				const evenCharX = x * 2 * charWidth;
				const oddCharX = evenCharX + charWidth;

				this.ctx.fillStyle = bgColorStr;
				this.ctx.fillRect(evenCharX, drawY, charWidth * 2, charHeight);
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
		this.ctx.restore();
	}
}
