import type { IBus } from "@/cpu/bus.interface";
import type { Video } from "@/video/video.interface";

type CharMetrics = {
	charWidth: number;
	charHeight: number;
	cols: number;
	rows: number;
	offsetTop: number;
	offsetLeft: number;
};

export class AppleVideo implements Video {
	private parent: Worker;
	private buffer: Uint8Array;
	private bus: IBus;
	private offscreenCanvas: OffscreenCanvas;
	private ctx: OffscreenCanvasRenderingContext2D;

	private static readonly TEXT_ROWS = 24;
	private static readonly TEXT_COLS = 40;

	// Offsets for each of the 24 lines in the text screen memory
	private static readonly textScreenLineOffsets = [
		0x000, 0x080, 0x100, 0x180, 0x200, 0x280, 0x300, 0x380, 0x028, 0x0a8, 0x128, 0x1a8, 0x228, 0x2a8, 0x328, 0x3a8,
		0x050, 0x0d0, 0x150, 0x1d0, 0x250, 0x2d0, 0x350, 0x3d0,
	];

	// Base of the primary text page
	private static readonly TEXT_PAGE_1_BASE = 0x400;

	private static readonly SCREEN_MARGIN_X = 10;
	private static readonly SCREEN_MARGIN_Y = 10;

	private static readonly MAIN_RAM_OFFSET = 0x4000;
	private static readonly AUX_RAM_OFFSET = 0x14000;

	private readonly charWidth: number;
	private readonly charHeight: number;

	private charmap: ImageBitmap | null = null;
	private charMetrics: CharMetrics | null = null;

	constructor(parent: Worker, mem: Uint8Array, width: number, height: number, bus: IBus, payload?: unknown) {
		this.parent = parent;
		this.buffer = mem;
		this.bus = bus;
		this.offscreenCanvas = new OffscreenCanvas(width, height);
		const context = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Could not get 2D context from OffscreenCanvas");

		this.ctx = context;
		this.ctx.imageSmoothingEnabled = false;

		this.charWidth = (this.offscreenCanvas.width - AppleVideo.SCREEN_MARGIN_X * 2) / AppleVideo.TEXT_COLS;
		this.charHeight = (this.offscreenCanvas.height - AppleVideo.SCREEN_MARGIN_Y * 2) / AppleVideo.TEXT_ROWS;

		console.log("AppleVideo", `view w${width}h${height}`, `char w${this.charWidth}h${this.charHeight}`);

		this.initPalette();

		if (payload?.charmap) {
			this.charmap = payload.charmap;
			this.charMetrics = payload.metrics;
		}
	}

	private initPalette() {
		const palette = new Uint8Array(256 * 4);
		// Create a 16-step grayscale-to-green palette for anti-aliasing
		const greenR = 0xee;
		const greenG = 0xee;
		const greenB = 0xee;

		for (let i = 0; i < 16; i++) {
			const step = i / 15; // 0 to 1
			palette[i * 4 + 0] = Math.round(greenR * step);
			palette[i * 4 + 1] = Math.round(greenG * step);
			palette[i * 4 + 2] = Math.round(greenB * step);
			palette[i * 4 + 3] = 0xff;
		}

		this.parent.postMessage({ command: "setPalette", colors: palette });
	}

	public tick() {
		this.ctx.fillStyle = "black";
		this.ctx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

		const isText = (this.bus.read(0xc01a) & 0x80) !== 0;

		if (isText) {
			const is80Col = (this.bus.read(0xc01f) & 0x80) !== 0;
			if (is80Col) this.renderText80();
			else this.renderText40();
		}

		const imageData = this.ctx.getImageData(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
		const src32 = new Uint32Array(imageData.data.buffer);
		const dest = this.buffer;

		// Convert RGBA pixels to 8-bit indices
		for (let i = 0; i < dest.length; i++) {
			// Since we render white text, any color channel can be used for brightness.
			// We scale the 0-255 brightness to a 0-15 palette index.
			const val = src32[i] ?? 0;
			const brightness = val & 0xff; // Use Red channel for brightness
			dest[i] = Math.floor((brightness / 256) * 16);
		}

		if (this.bus.syncState) this.bus.syncState();
	}

	private drawChar(charCode: number, x: number, y: number, width?: number) {
		if (!this.charmap || !this.charMetrics) return;

		// Calculate source position in atlas (simple math, very fast)
		const col = charCode % this.charMetrics.cols;
		const row = Math.floor(charCode / this.charMetrics.rows);

		const srcX = col * this.charMetrics.charWidth;
		const srcY = row * this.charMetrics.charHeight;

		// Draw from atlas
		this.ctx.drawImage(
			this.charmap,
			srcX,
			srcY,
			this.charMetrics.charWidth,
			this.charMetrics.charHeight, // source
			x,
			y,
			width ?? this.charWidth,
			this.charHeight, // destination
		);
	}

	private renderText40() {
		for (let y = 0; y < AppleVideo.TEXT_ROWS; y++) {
			const lineBase = AppleVideo.TEXT_PAGE_1_BASE + (AppleVideo.textScreenLineOffsets[y] ?? 0);
			for (let x = 0; x < AppleVideo.TEXT_COLS; x++) {
				const charCode = this.bus.read(lineBase + x); //mapAppleChr(this.bus.read(lineBase + x)).charCodeAt(0);

				const drawX = AppleVideo.SCREEN_MARGIN_X + x * this.charWidth;
				const drawY = AppleVideo.SCREEN_MARGIN_Y + y * this.charHeight;

				this.drawChar(charCode, drawX, drawY);
			}
		}
	}

	private renderText80() {
		const charWidth80 = this.charWidth / 2;
		for (let y = 0; y < AppleVideo.TEXT_ROWS; y++) {
			const lineBase = AppleVideo.TEXT_PAGE_1_BASE + (AppleVideo.textScreenLineOffsets[y] ?? 0);
			for (let x = 0; x < AppleVideo.TEXT_COLS; x++) {
				const drawY = AppleVideo.SCREEN_MARGIN_Y + y * this.charHeight;

				// Aux char (Even column)
				const auxVal = this.buffer[AppleVideo.AUX_RAM_OFFSET + lineBase + x] as number;
				const drawXAux = AppleVideo.SCREEN_MARGIN_X + x * 2 * charWidth80;
				this.drawChar(auxVal, drawXAux, drawY, charWidth80);

				// Main char (Odd column)
				const mainVal = this.buffer[AppleVideo.MAIN_RAM_OFFSET + lineBase + x] as number;
				const drawXMain = AppleVideo.SCREEN_MARGIN_X + (x * 2 + 1) * charWidth80;
				this.drawChar(mainVal, drawXMain, drawY, charWidth80);
			}
		}
	}

	public reset() {
		this.buffer.fill(0);
		if (this.ctx) this.ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
	}
}
