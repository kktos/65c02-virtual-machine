import { getFontRow } from "./arcade.font";

const GLYPH_SIZE = 8;

export class DebugText {
	// Each font pixel is drawn as a scale x scale block. The Apple renderers draw every
	// Apple pixel as a 2x2 block, so scale 2 keeps the debug text on the same pixel grid
	// and lets it survive the non-integer canvas stretch like the rest of the picture.
	constructor(
		private buffer: Uint8Array,
		private width: number,
		private height: number,
		private scale = 2,
	) {}

	public get charSize() {
		return GLYPH_SIZE * this.scale;
	}

	public resize(width: number, height: number) {
		this.width = width;
		this.height = height;
	}

	public drawRect(x: number, y: number, w: number, h: number, color: number) {
		for (let row = 0; row < h; row++) {
			const destY = y + row;
			if (destY < 0 || destY >= this.height) continue;
			const rowOffset = destY * this.width;
			for (let col = 0; col < w; col++) {
				const destX = x + col;
				if (destX < 0 || destX >= this.width) continue;
				this.buffer[rowOffset + destX] = color;
			}
		}
	}

	public drawPixel(x: number, y: number, color: number) {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
		this.buffer[y * this.width + x] = color;
	}

	public drawChar(x: number, y: number, charCode: number, color: number) {
		const s = this.scale;
		for (let row = 0; row < GLYPH_SIZE; row++) {
			const pixels = getFontRow(charCode, row);
			for (let col = 0; col < GLYPH_SIZE; col++) {
				if ((pixels >> (7 - col)) & 1) this.drawRect(x + col * s, y + row * s, s, s, color);
			}
		}
	}

	public drawString(x: number, y: number, text: string, color: number) {
		let curX = x;
		for (let i = 0; i < text.length; i++) {
			this.drawChar(curX, y, text.charCodeAt(i), color);
			curX += this.charSize;
		}
	}

	public drawCenteredString(y: number, text: string, color: number, backgroundColor?: number) {
		const textWidth = text.length * this.charSize;
		const x = Math.floor((this.width - textWidth) / 2);
		const pad = this.scale;
		if (backgroundColor !== undefined)
			this.drawRect(x - pad, y - pad, textWidth + pad * 2, this.charSize + pad * 2, backgroundColor);
		this.drawString(x, y, text, color);
	}
}
