import type { IBus } from "@/cpu/bus.interface";
import type { Video } from "@/video/video.interface";

type VideoMode = "TEXT40" | "TEXT80";
// Other modes to be added

// Helper to convert Apple's weird character codes to something renderable
// This is a simplified mapping for "normal" characters (white on black)
function mapAppleChr(char: number): string {
	// For normal text mode characters, the high bit is set.
	// We're ignoring inverse and flashing for now.
	const ascii = char & 0x7f;

	// Characters in the range 0x40-0x7F are standard ASCII
	if (ascii >= 0x40 && ascii <= 0x7f) return String.fromCharCode(ascii);

	// Other ranges map to symbols or lowercase letters in special ways
	// This is a simplification.
	if (ascii < 0x20) return String.fromCharCode(ascii + 0x40); // Treat as control characters -> @, A, B...

	// For now, return a placeholder for unhandled characters
	return String.fromCharCode(ascii);
}

export class AppleVideo implements Video {
	private parent: Worker;
	private buffer: Uint8Array;
	private bus: IBus;
	private offscreenCanvas: OffscreenCanvas;
	private ctx: OffscreenCanvasRenderingContext2D;

	private mode: VideoMode = "TEXT40";

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

	private readonly charWidth: number;
	private readonly charHeight: number;

	constructor(parent: Worker, mem: Uint8Array, width: number, height: number, bus: IBus) {
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

		//FontFaceSet.check();
		if (((parent as any).fonts as FontFaceSet).check("16px PrintChar21")) console.log("AppleVideo", "Font loaded");

		this.initPalette();
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
		console.log("AppleVideo.tick", this.mode);

		switch (this.mode) {
			case "TEXT40":
				this.renderText40();
				break;
			// other modes...
		}

		if ("syncState" in this.bus) {
			(this.bus as any).syncState();
		}
	}

	private renderText40() {
		this.ctx.fillStyle = "black";
		this.ctx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

		this.ctx.fillStyle = "white";
		this.ctx.font = `${this.charHeight}px "PrintChar21"`; // Using a pixel font
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";

		for (let y = 0; y < AppleVideo.TEXT_ROWS; y++) {
			const lineBase = AppleVideo.TEXT_PAGE_1_BASE + (AppleVideo.textScreenLineOffsets[y] ?? 0);
			for (let x = 0; x < AppleVideo.TEXT_COLS; x++) {
				const charCode = this.bus.read(lineBase + x);
				const char = mapAppleChr(charCode);

				// Calculate position to draw the character
				const drawX = AppleVideo.SCREEN_MARGIN_X + (x + 0.5) * this.charWidth;
				const drawY = AppleVideo.SCREEN_MARGIN_Y + (y + 0.5) * this.charHeight;

				this.ctx.fillText(char, drawX, drawY);
			}
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
	}

	public reset() {
		this.buffer.fill(0);
		if (this.ctx) this.ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
	}
}
