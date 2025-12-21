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

		this.charWidth = this.offscreenCanvas.width / AppleVideo.TEXT_COLS;
		this.charHeight = this.offscreenCanvas.height / AppleVideo.TEXT_ROWS;

		console.log("AppleVideo", this.charWidth, this.charHeight);

		this.initPalette();
	}

	private initPalette() {
		const palette = new Uint8Array(256 * 4);
		// Index 0: Black
		palette[0] = 0x00;
		palette[1] = 0x00;
		palette[2] = 0x00;
		palette[3] = 0xff;
		// Index 1: Apple Green
		palette[4] = 0x33;
		palette[5] = 0xd4;
		palette[6] = 0x33;
		palette[7] = 0xff;

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

		if (this.bus.saveState) this.parent.postMessage({ command: "syncState", state: this.bus.saveState() });
	}

	private renderText40() {
		this.ctx.fillStyle = "black";
		this.ctx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

		this.ctx.fillStyle = "white";
		// this.ctx.font = `${this.charHeight * 0.9}px "PrintChar21"`; // Using a pixel font
		this.ctx.font = `${this.charHeight * 0.9}px`;
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";

		for (let y = 0; y < AppleVideo.TEXT_ROWS; y++) {
			const lineBase = AppleVideo.TEXT_PAGE_1_BASE + (AppleVideo.textScreenLineOffsets[y] ?? 0);
			for (let x = 0; x < AppleVideo.TEXT_COLS; x++) {
				const charCode = this.bus.read(lineBase + x);
				const char = mapAppleChr(charCode);

				// Calculate position to draw the character
				const drawX = (x + 0.5) * this.charWidth;
				const drawY = (y + 0.5) * this.charHeight;

				this.ctx.fillText(char, drawX, drawY);
			}
		}

		const imageData = this.ctx.getImageData(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
		const src32 = new Uint32Array(imageData.data.buffer);
		const dest = this.buffer;

		// Convert RGBA pixels to 8-bit indices
		for (let i = 0; i < dest.length; i++) {
			// If pixel has any color (not black), map to Index 1 (Green), else 0 (Black)
			dest[i] = (src32[i] ?? 0 & 0x00ffffff) !== 0 ? 1 : 0;
		}
	}

	public reset() {
		this.buffer.fill(0);
		if (this.ctx) this.ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
	}
}
