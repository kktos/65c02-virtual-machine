import type { IBus } from "@/cpu/bus.interface";
import type { Video } from "@/video/video.interface";
import * as SoftSwitches from "./bus/softswitches";

type CharMetrics = {
	charWidth: number;
	charHeight: number;
	cols: number;
	rows: number;
	offsetTop: number;
	offsetLeft: number;
};

const TEXT_ROWS = 24;
const TEXT_COLS = 40;

// Offsets for each of the 24 lines in the text screen memory
// Includes the Text Page 1 Base ($400)
const textScreenLineOffsets = [
	0x400, 0x480, 0x500, 0x580, 0x600, 0x680, 0x700, 0x780, 0x428, 0x4a8, 0x528, 0x5a8, 0x628, 0x6a8, 0x728, 0x7a8, 0x450,
	0x4d0, 0x550, 0x5d0, 0x650, 0x6d0, 0x750, 0x7d0,
];

const IIgsPaletteRGB = [
	[0x00, 0x00, 0x00], // 0 Black
	[0xdd, 0x00, 0x30], // 1 Deep Red
	[0x00, 0x00, 0x99], // 2 Dark Blue
	[0xdd, 0x22, 0xdd], // 3 Purple
	[0x00, 0x77, 0x22], // 4 Dark Green
	[0x55, 0x55, 0x55], // 5 Dark Gray
	[0x22, 0x22, 0xff], // 6 Medium Blue
	[0x66, 0xaa, 0xff], // 7 Light Blue
	[0x88, 0x55, 0x00], // 8 Brown
	[0xff, 0x66, 0x00], // 9 Orange
	[0xaa, 0xaa, 0xaa], // 10 Light Gray
	[0xff, 0x99, 0x88], // 11 Pink
	[0x11, 0xdd, 0x00], // 12 Light Green
	[0xff, 0xff, 0x00], // 13 Yellow
	[0x41, 0xff, 0x99], // 14 Aquamarine
	[0xff, 0xff, 0xff], // 15 White
];

// HGR Colors (Indices into IIgsPaletteRGB)
const HGR_BLACK = 0;
const HGR_WHITE = 15;
const HGR_GREEN = 12;
const HGR_VIOLET = 3;
const HGR_ORANGE = 9;
const HGR_BLUE = 6;
const HGR_LINES = 192;
const HGR_MIXED_LINES = 160;

const SCREEN_MARGIN_X = 10;
const SCREEN_MARGIN_Y = 10;

const AUX_BANK_OFFSET = 0x10000;

export class AppleVideo implements Video {
	private parent: Worker;
	private buffer: Uint8Array;
	private bus: IBus;
	private offscreenCanvas: OffscreenCanvas;
	private ctx: OffscreenCanvasRenderingContext2D;

	private readonly charWidth: number;
	private readonly charHeight: number;

	private charmap40: ImageBitmap | null = null;
	private metrics40: CharMetrics | null = null;
	private charmap80: ImageBitmap | null = null;
	private metrics80: CharMetrics | null = null;

	constructor(parent: Worker, mem: Uint8Array, width: number, height: number, bus: IBus, payload?: unknown) {
		this.parent = parent;
		this.buffer = mem;
		this.bus = bus;
		this.offscreenCanvas = new OffscreenCanvas(width, height);
		const context = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Could not get 2D context from OffscreenCanvas");

		this.ctx = context;
		this.ctx.imageSmoothingEnabled = false;

		this.charWidth = (this.offscreenCanvas.width - SCREEN_MARGIN_X * 2) / TEXT_COLS;
		this.charHeight = (this.offscreenCanvas.height - SCREEN_MARGIN_Y * 2) / TEXT_ROWS;

		console.log("AppleVideo", `view w${width}h${height}`, `char w${this.charWidth}h${this.charHeight}`);

		this.initPalette();

		if (payload?.charmap40) {
			this.charmap40 = payload.charmap40;
			this.metrics40 = payload.metrics40;
			this.charmap80 = payload.charmap80;
			this.metrics80 = payload.metrics80;
		}
	}

	private initPalette() {
		const palette = new Uint8Array(256 * 4);
		// IIgs 16-color palette
		for (let i = 0; i < 16; i++) {
			palette[i * 4 + 0] = IIgsPaletteRGB[i]![0];
			palette[i * 4 + 1] = IIgsPaletteRGB[i]![1];
			palette[i * 4 + 2] = IIgsPaletteRGB[i]![2];
			palette[i * 4 + 3] = 0xff;
		}

		this.parent.postMessage({ command: "setPalette", colors: palette });
	}

	public tick() {
		this.ctx.fillStyle = "black";
		this.ctx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

		const isText = (this.bus.read(SoftSwitches.TEXT) & 0x80) !== 0;
		const isHgr = (this.bus.read(SoftSwitches.HIRES) & 0x80) !== 0;
		const isMixed = (this.bus.read(SoftSwitches.MIXED) & 0x80) !== 0;
		const is80Col = (this.bus.read(SoftSwitches.COL80) & 0x80) !== 0;

		if (isText) {
			if (is80Col) this.renderText80();
			else this.renderText40();
		} else if (isHgr) {
			this.renderHgr(0, isMixed ? HGR_MIXED_LINES : HGR_LINES);
			if (isMixed) {
				if (is80Col) this.renderText80(20, 24);
				else this.renderText40(20, 24);
			}
		}

		const dest = this.buffer;

		// Only read back from canvas if we rendered text
		if (isText || isMixed) {
			const imageData = this.ctx.getImageData(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
			const src32 = new Uint32Array(imageData.data.buffer);

			const tbColor = this.bus.read(SoftSwitches.TBCOLOR);
			const bgColorIndex = tbColor & 0x0f;
			const fgColorIndex = (tbColor >> 4) & 0x0f;

			let startIdx = 0;
			if (isMixed && !isText) {
				// Mixed Mode: Copy only the bottom 4 lines of text (lines 20-23)
				const width = this.offscreenCanvas.width;
				const scanlineHeight = this.charHeight / 8;
				// Start at line 160 (Mixed mode split point)
				const mixedTopY = Math.floor(SCREEN_MARGIN_Y + 160 * scanlineHeight);
				startIdx = mixedTopY * width;
			}

			// Convert RGBA pixels to 8-bit indices
			for (let i = startIdx; i < dest.length; i++) {
				// Since we render white text on black, any color channel can be used for brightness.
				const val = src32[i] ?? 0;
				const brightness = val & 0xff; // Use Red channel for brightness
				// Only overwrite if we have text pixels (brightness > 0) or if we want to enforce text background
				// For mixed mode, we usually want the text background to overwrite the HGR garbage below it
				dest[i] = brightness > 128 ? fgColorIndex : bgColorIndex;
			}
		}

		if (this.bus.syncState) this.bus.syncState();
	}

	private renderHgr(startLine = 0, endLine = HGR_LINES) {
		const isPage2 = (this.bus.read(SoftSwitches.PAGE2) & 0x80) !== 0;
		const baseAddr = isPage2 ? 0x4000 : 0x2000;

		const width = this.offscreenCanvas.width;
		// Calculate scaling factors to map 280x192 to the canvas dimensions
		const scaleX = (width - 2 * SCREEN_MARGIN_X) / 280;
		const scanlineHeight = this.charHeight / 8; // 192 scanlines map to 24 text rows

		// Iterate over all 192 scanlines
		for (let y = startLine; y < endLine; y++) {
			// Calculate HGR Memory Address
			// Address = Base + (y/64)*0x28 + (y%8)*0x400 + ((y/8)%8)*0x80
			const rowOffset = Math.floor(y / 64) * 0x28 + (y % 8) * 0x400 + (Math.floor(y / 8) & 7) * 0x80;
			const addr = baseAddr + rowOffset;

			// Calculate Y screen bounds for this scanline
			const drawYStart = Math.floor(SCREEN_MARGIN_Y + y * scanlineHeight);
			const drawYEnd = Math.floor(SCREEN_MARGIN_Y + (y + 1) * scanlineHeight);

			// Process 40 bytes per line (280 pixels)
			for (let byteIdx = 0; byteIdx < 40; byteIdx++) {
				const byte = this.bus.readRaw(addr + byteIdx);
				const paletteShift = (byte & 0x80) !== 0;

				// Process 7 pixels per byte
				for (let bit = 0; bit < 7; bit++) {
					const xHgr = byteIdx * 7 + bit;
					const pixelOn = (byte & (1 << bit)) !== 0;

					let color = HGR_BLACK;
					if (pixelOn) {
						// Even/Odd column determines color group
						const isEven = xHgr % 2 === 0;
						if (paletteShift) {
							color = isEven ? HGR_ORANGE : HGR_BLUE;
						} else {
							color = isEven ? HGR_GREEN : HGR_VIOLET;
						}

						// Simple White detection: Check if next pixel is also ON
						// (This is a basic approximation; real hardware artifacting is complex)
						const nextBit = bit + 1;
						if (nextBit < 7) {
							if ((byte & (1 << nextBit)) !== 0) color = HGR_WHITE;
						}
						// Note: To handle white correctly across byte boundaries,
						// we would need to peek at the next byte.
					}

					// Draw the pixel scaled horizontally and vertically
					const drawXStart = Math.floor(SCREEN_MARGIN_X + xHgr * scaleX);
					const drawXEnd = Math.floor(SCREEN_MARGIN_X + (xHgr + 1) * scaleX);

					for (let dy = drawYStart; dy < drawYEnd; dy++) {
						const bufRow = dy * width;
						for (let dx = drawXStart; dx < drawXEnd; dx++) {
							this.buffer[bufRow + dx] = color;
						}
					}
				}
			}
		}
	}

	private drawChar(charCode: number, x: number, y: number, width: number, is80Col: boolean) {
		const charmap = is80Col ? this.charmap80 : this.charmap40;
		const metrics = is80Col ? this.metrics80 : this.metrics40;

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
			this.charHeight, // destination
		);
	}

	private renderText40(startRow = 0, endRow = TEXT_ROWS) {
		for (let y = startRow; y < endRow; y++) {
			const lineBase = textScreenLineOffsets[y] ?? 0;
			for (let x = 0; x < TEXT_COLS; x++) {
				const charCode = this.bus.readRaw?.(lineBase + x) ?? 0;

				const drawX = SCREEN_MARGIN_X + x * this.charWidth;
				const drawY = SCREEN_MARGIN_Y + y * this.charHeight;

				this.drawChar(charCode, drawX, drawY, this.charWidth, false);
			}
		}
	}

	private renderText80(startRow = 0, endRow = TEXT_ROWS) {
		const charWidth80 = this.charWidth / 2;
		for (let y = startRow; y < endRow; y++) {
			const lineBase = textScreenLineOffsets[y] ?? 0;
			for (let x = 0; x < TEXT_COLS; x++) {
				const drawY = SCREEN_MARGIN_Y + y * this.charHeight;

				// Aux char (Even column)
				const auxVal = this.bus.readRaw?.(AUX_BANK_OFFSET + lineBase + x) ?? 0;
				const drawXAux = SCREEN_MARGIN_X + x * 2 * charWidth80;
				this.drawChar(auxVal, drawXAux, drawY, charWidth80, true);

				// Main char (Odd column)
				const mainVal = this.bus.readRaw?.(lineBase + x) ?? 0;
				const drawXMain = SCREEN_MARGIN_X + (x * 2 + 1) * charWidth80;
				this.drawChar(mainVal, drawXMain, drawY, charWidth80, true);
			}
		}
	}

	public reset() {
		this.buffer.fill(0);
		if (this.ctx) this.ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
	}
}
