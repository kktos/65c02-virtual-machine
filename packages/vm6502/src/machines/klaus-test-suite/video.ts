import type { Video } from "@/video/video.interface";

// Helper to convert HSL to RGB for color cycling
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	let r: number;
	let g: number;
	let b: number;
	if (s === 0) {
		r = g = b = l; // achromatic
	} else {
		const hue2rgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}
	return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export class KlausVideo implements Video {
	private buffer: Uint8Array;
	private tickCount = 0;

	private offscreenCanvas: OffscreenCanvas;
	private ctx: OffscreenCanvasRenderingContext2D;

	constructor(buffer: Uint8Array, width: number, height: number) {
		this.buffer = buffer;
		this.offscreenCanvas = new OffscreenCanvas(width, height);
		const context = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Could not get 2D context from OffscreenCanvas");
		this.ctx = context;
	}

	public tick() {
		// 1. Clear the canvas
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
		this.buffer.set(imageData.data);

		this.tickCount++;
	}

	public reset() {
		// Fill with black on reset
		this.buffer.fill(0);
	}
}
