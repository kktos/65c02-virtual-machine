import { hslToRgb } from "@/lib/colors.utils";
import type { Video } from "@/video/video.interface";

export class KlausVideo implements Video {
	private buffer: Uint8Array;
	private tickCount = 0;

	private offscreenCanvas: OffscreenCanvas;
	private ctx: OffscreenCanvasRenderingContext2D;
	private parent: Worker;

	constructor(parent: Worker, mem: Uint8Array, width: number, height: number) {
		this.parent = parent;
		this.buffer = mem;
		this.offscreenCanvas = new OffscreenCanvas(width, height);
		const context = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Could not get 2D context from OffscreenCanvas");
		this.ctx = context;
		this.initPalette();
	}

	private initPalette() {
		// Generate a standard 3-3-2 RGB palette (256 colors)
		const palette = new Uint8Array(256 * 4);
		for (let i = 0; i < 256; i++) {
			// Extract RGB components from the byte index
			// R: bits 5-7 (3 bits) -> map to 0-255
			// G: bits 2-4 (3 bits) -> map to 0-255
			// B: bits 0-1 (2 bits) -> map to 0-255
			palette[i * 4 + 0] = Math.round(((i >> 5) & 7) * (255 / 7));
			palette[i * 4 + 1] = Math.round(((i >> 2) & 7) * (255 / 7));
			palette[i * 4 + 2] = Math.round((i & 3) * (255 / 3));
			palette[i * 4 + 3] = 255; // Alpha
		}
		this.parent.postMessage({ command: "setPalette", colors: palette });
	}

	public tick() {
		// memory is unused
		// 1. Clear the canvas to be transparent
		// this.ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
		this.ctx.fillStyle = "black";
		this.ctx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

		// 2. Calculate a new color for this frame
		const hue = (this.tickCount / 100) % 1;
		const [r, g, b] = hslToRgb(hue, 0.8, 0.7);
		this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

		// 3. Draw the text
		this.ctx.font = "30px 'Press Start 2P'";
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";
		this.ctx.fillText("Klaus Test", this.offscreenCanvas.width / 2, this.offscreenCanvas.height / 2 - 10);

		// 4. Draw the line
		const textMetrics = this.ctx.measureText("Klaus Test");
		const lineY = this.offscreenCanvas.height / 2 + textMetrics.actualBoundingBoxAscent / 2;
		this.ctx.fillRect(this.offscreenCanvas.width / 2 - textMetrics.width / 2, lineY, textMetrics.width, 5);

		// 5. Copy the result to the shared buffer
		const imageData = this.ctx.getImageData(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
		const src32 = new Uint32Array(imageData.data.buffer);
		const dest = this.buffer;
		const len = dest.length;

		for (let i = 0; i < len; i++) {
			const val = src32[i] ?? 0;
			// Convert RGBA (Little Endian: AABBGGRR) to 8-bit 3-3-2 RGB index
			dest[i] = (val & 0xe0) | ((val & 0xe000) >> 11) | ((val & 0xc00000) >> 22);
		}

		this.tickCount++;
	}

	public reset() {
		// Clear the buffer on reset
		this.buffer.fill(0);
		// this.ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
	}
}
