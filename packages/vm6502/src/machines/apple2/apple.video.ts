import type { Video } from "@/types/video.interface";
import type { IBus } from "@/virtualmachine/cpu/bus.interface";
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

const SCREEN_MARGIN_X = 0;
const SCREEN_MARGIN_Y = 0;
const NATIVE_WIDTH = 280;
const NATIVE_HEIGHT = 192;

const AUX_BANK_OFFSET = 0x10000;

export class AppleVideo implements Video {
	private parent: Worker;
	private buffer: Uint8Array;
	private bus: IBus;
	private offscreenCanvas: OffscreenCanvas;
	private ctx: OffscreenCanvasRenderingContext2D;
	private targetWidth: number;
	private targetHeight: number;

	private readonly charWidth: number;
	private readonly charHeight: number;

	private charmap40: ImageBitmap | null = null;
	private metrics40: CharMetrics | null = null;
	private charmap80: ImageBitmap | null = null;
	private metrics80: CharMetrics | null = null;

	private overrides: Record<string, unknown> = {};

	constructor(parent: Worker, mem: Uint8Array, width: number, height: number, bus: IBus, payload?: unknown) {
		this.parent = parent;
		this.buffer = mem;
		this.bus = bus;
		this.targetWidth = width;
		this.targetHeight = height;
		this.offscreenCanvas = new OffscreenCanvas(NATIVE_WIDTH + SCREEN_MARGIN_X * 2, NATIVE_HEIGHT + SCREEN_MARGIN_Y * 2);
		const context = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Could not get 2D context from OffscreenCanvas");

		this.ctx = context;
		this.ctx.imageSmoothingEnabled = false;

		this.charWidth = NATIVE_WIDTH / TEXT_COLS;
		this.charHeight = NATIVE_HEIGHT / TEXT_ROWS;

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

	public setDebugOverrides(overrides: Record<string, unknown>) {
		this.overrides = overrides;
	}

	public tick() {
		this.ctx.fillStyle = "black";
		this.ctx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

		let isText = (this.bus.read(SoftSwitches.TEXT) & 0x80) !== 0;
		let isHgr = (this.bus.read(SoftSwitches.HIRES) & 0x80) !== 0;
		const isMixed = (this.bus.read(SoftSwitches.MIXED) & 0x80) !== 0;
		const is80Col = (this.bus.read(SoftSwitches.COL80) & 0x80) !== 0;
		let isPage2 = (this.bus.read(SoftSwitches.PAGE2) & 0x80) !== 0;

		if (this.overrides.videoMode === "TEXT") {
			isText = true;
		} else if (this.overrides.videoMode === "HGR") {
			isText = false;
			isHgr = true;
		}

		if (this.overrides.videoPage === "PAGE1") {
			isPage2 = false;
		} else if (this.overrides.videoPage === "PAGE2") {
			isPage2 = true;
		}

		if (isText) {
			if (is80Col) this.renderText80(0, TEXT_ROWS, isPage2);
			else this.renderText40(0, TEXT_ROWS, isPage2);
		} else if (isHgr) {
			this.renderHgr(0, isMixed ? HGR_MIXED_LINES : HGR_LINES, isPage2);
			if (isMixed) {
				if (is80Col) this.renderText80(20, 24, isPage2);
				else this.renderText40(20, 24, isPage2);
			}
		}

		const dest = this.buffer;
		const scaleY = this.targetHeight / this.offscreenCanvas.height;

		// Only read back from canvas if we rendered text
		if (isText || isMixed) {
			const imageData = this.ctx.getImageData(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
			const src32 = new Uint32Array(imageData.data.buffer);
			const srcWidth = this.offscreenCanvas.width;

			const tbColor = this.bus.read(SoftSwitches.TBCOLOR);
			const bgColorIndex = tbColor & 0x0f;
			const fgColorIndex = (tbColor >> 4) & 0x0f;

			let startY = 0;
			if (isMixed && !isText) {
				// Mixed Mode: Copy only the bottom 4 lines of text (lines 20-23)
				// Start at line 160 (Mixed mode split point)
				// We need to calculate the Y position in the TARGET buffer
				startY = Math.floor((SCREEN_MARGIN_Y + 160) * scaleY);
			}

			// Convert RGBA pixels to 8-bit indices
			// We loop over the DESTINATION buffer dimensions
			for (let y = startY; y < this.targetHeight; y++) {
				const srcY = Math.floor(y / scaleY);
				const srcRowOffset = srcY * srcWidth;
				const destRowOffset = y * this.targetWidth;

				for (let x = 0; x < this.targetWidth; x++) {
					// Simple nearest neighbor for X (assuming width matches for now, but safe to scale)
					// If targetWidth == srcWidth (560), this maps 1:1
					const val = src32[srcRowOffset + x] ?? 0;
					const brightness = val & 0xff;

					dest[destRowOffset + x] = brightness > 128 ? fgColorIndex : bgColorIndex;
				}
			}
		}

		if ((globalThis as any).DEBUG_VIDEO) this.handleDebugVideo();

		if (this.bus.syncState) this.bus.syncState();
	}

	private renderHgr(startLine = 0, endLine = HGR_LINES, isPage2: boolean) {
		// const isPage2 = (this.bus.read(SoftSwitches.PAGE2) & 0x80) !== 0;
		const baseAddr = isPage2 ? 0x4000 : 0x2000;

		// Scale HGR to fit the target buffer
		const scaleX = (this.targetWidth - 2 * SCREEN_MARGIN_X) / 280;
		const scanlineHeight = this.targetHeight / HGR_LINES;

		for (let y = startLine; y < endLine; y++) {
			const rowOffset = Math.floor(y / 64) * 0x28 + (y % 8) * 0x400 + (Math.floor(y / 8) & 7) * 0x80;
			const addr = baseAddr + rowOffset;

			const drawYStart = Math.floor(SCREEN_MARGIN_Y * (this.targetHeight / NATIVE_HEIGHT) + y * scanlineHeight);
			const drawYEnd = Math.floor(SCREEN_MARGIN_Y * (this.targetHeight / NATIVE_HEIGHT) + (y + 1) * scanlineHeight);

			for (let byteIdx = 0; byteIdx < 40; byteIdx++) {
				const byte = this.bus.readRaw(addr + byteIdx);
				const paletteShift = (byte & 0x80) !== 0;

				const prevByte = byteIdx > 0 ? this.bus.readRaw(addr + byteIdx - 1) : 0;
				const nextByte = byteIdx < 39 ? this.bus.readRaw(addr + byteIdx + 1) : 0;

				for (let bit = 0; bit < 7; bit++) {
					const xHgr = byteIdx * 7 + bit;
					const pixelOn = (byte & (1 << bit)) !== 0;

					let color = HGR_BLACK;
					if (pixelOn) {
						const isEven = xHgr % 2 === 0;

						// Check neighbors
						let prevPixelOn = false;
						let nextPixelOn = false;

						if (bit > 0) {
							prevPixelOn = (byte & (1 << (bit - 1))) !== 0;
						} else if (byteIdx > 0) {
							prevPixelOn = (prevByte & (1 << 6)) !== 0;
						}

						if (bit < 6) {
							nextPixelOn = (byte & (1 << (bit + 1))) !== 0;
						} else if (byteIdx < 39) {
							nextPixelOn = (nextByte & 1) !== 0;
						}

						// Two adjacent ON pixels = white
						if (prevPixelOn || nextPixelOn) {
							color = HGR_WHITE;
						} else {
							// Single isolated pixel = color (may appear dim on real hardware)
							// But we'll render it as the full color
							if (paletteShift) {
								color = isEven ? HGR_BLUE : HGR_ORANGE;
							} else {
								color = isEven ? HGR_VIOLET : HGR_GREEN;
							}
						}
					}

					// const drawXStart = Math.floor(SCREEN_MARGIN_X + xHgr * scaleX);
					// const drawXEnd = Math.floor(SCREEN_MARGIN_X + (xHgr + 1) * scaleX);

					const drawXStart = Math.floor(SCREEN_MARGIN_X + xHgr * scaleX);
					const drawXEnd = Math.floor(SCREEN_MARGIN_X + (xHgr + 1) * scaleX);

					// Ensure we always draw at least one pixel
					const actualXEnd = Math.max(drawXEnd, drawXStart + 1);

					for (let dy = drawYStart; dy < drawYEnd; dy++) {
						const bufRow = dy * this.targetWidth;
						for (let dx = drawXStart; dx < actualXEnd; dx++) {
							this.buffer[bufRow + dx] = color;
						}
					}
				}
			}
		}
	}

	private handleDebugVideo() {
		(globalThis as any).DEBUG_VIDEO = false;
		this.offscreenCanvas.convertToBlob().then((blob) => {
			const reader = new FileReader();
			reader.onload = () => {
				const url = reader.result as string;
				console.log("AppleVideo Canvas Snapshot:", this.offscreenCanvas.width, this.offscreenCanvas.height);
				console.log(
					"%c  ",
					`font-size: 1px; padding: ${this.offscreenCanvas.height / 2}px ${this.offscreenCanvas.width / 2}px; background: url(${url}) no-repeat; background-size: contain;`,
				);
			};
			reader.readAsDataURL(blob);
		});

		// Reconstruct image from the buffer to verify the copy process
		const width = this.targetWidth;
		const height = this.targetHeight;
		const debugCanvas = new OffscreenCanvas(width, height);
		const debugCtx = debugCanvas.getContext("2d");
		if (debugCtx) {
			const imgData = debugCtx.createImageData(width, height);
			for (let i = 0; i < width * height; i++) {
				const colorIdx = this.buffer[i];
				const rgb = IIgsPaletteRGB[colorIdx & 0x0f] || [0, 0, 0];
				imgData.data[i * 4 + 0] = rgb[0];
				imgData.data[i * 4 + 1] = rgb[1];
				imgData.data[i * 4 + 2] = rgb[2];
				imgData.data[i * 4 + 3] = 255;
			}
			debugCtx.putImageData(imgData, 0, 0);
			debugCanvas.convertToBlob().then((blob) => {
				const reader = new FileReader();
				reader.onload = () => {
					const url = reader.result as string;
					console.log("AppleVideo Buffer Snapshot:", width, height);
					console.log(
						"%c  ",
						`font-size: 1px; padding: ${height / 2}px ${width / 2}px; background: url(${url}) no-repeat; background-size: contain;`,
					);
				};
				reader.readAsDataURL(blob);
			});
		}

		// Lorem Ipsum Debug
		const padding = 2;
		const cellWidth = this.charWidth + padding * 2;
		const cellHeight = this.charHeight + padding * 2;
		const loremWidth = 40 * cellWidth;
		const loremHeight = 24 * cellHeight;

		const loremCanvas = new OffscreenCanvas(loremWidth, loremHeight);
		const loremCtx = loremCanvas.getContext("2d");

		if (loremCtx && this.charmap40 && this.metrics40) {
			// loremCtx.imageSmoothingEnabled = false;
			loremCtx.fillStyle = "black";
			loremCtx.fillRect(0, 0, loremWidth, loremHeight);

			// const text =
			// 	"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

			let charIndex = 0;
			for (let y = 0; y < 24; y++) {
				for (let x = 0; x < 40; x++) {
					const charCode = (charIndex % 255) | 0x80; //text.charCodeAt(charIndex % text.length) | 0x80;
					charIndex++;

					const destX = x * cellWidth + padding;
					const destY = y * cellHeight + padding;

					const m = this.metrics40;
					const srcX = (charCode % m.cols) * m.charWidth;
					const srcY = Math.floor(charCode / m.rows) * m.charHeight;

					if (charIndex === 56)
						loremCtx.drawImage(
							this.charmap40,
							srcX,
							srcY,
							m.charWidth,
							m.charHeight,
							destX,
							destY,
							this.charWidth,
							this.charHeight,
						);
				}
			}

			loremCanvas.convertToBlob().then((blob) => {
				const reader = new FileReader();
				reader.onload = () => {
					const url = reader.result as string;
					console.log("AppleVideo Lorem Ipsum Snapshot:", loremWidth, loremHeight);
					console.log(
						"%c  ",
						`font-size: 1px; padding: ${loremHeight / 2}px ${loremWidth / 2}px; background: url(${url}) no-repeat; background-size: contain;`,
					);
				};
				reader.readAsDataURL(blob);
			});
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

	private renderText40(startRow = 0, endRow = TEXT_ROWS, isPage2 = false) {
		const pageOffset = isPage2 ? 0x400 : 0;
		for (let y = startRow; y < endRow; y++) {
			const lineBase = (textScreenLineOffsets[y] ?? 0) + pageOffset;
			for (let x = 0; x < TEXT_COLS; x++) {
				const charCode = this.bus.readRaw?.(lineBase + x) ?? 0;

				const drawX = SCREEN_MARGIN_X + x * this.charWidth;
				const drawY = SCREEN_MARGIN_Y + y * this.charHeight;

				this.drawChar(charCode, drawX, drawY, this.charWidth, false);
			}
		}
	}

	private renderText80(startRow = 0, endRow = TEXT_ROWS, isPage2 = false) {
		const pageOffset = isPage2 ? 0x400 : 0;
		const charWidth80 = this.charWidth / 2;
		for (let y = startRow; y < endRow; y++) {
			const lineBase = (textScreenLineOffsets[y] ?? 0) + pageOffset;
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
