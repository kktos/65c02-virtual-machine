import { getFontRow } from "./arcade.font";

export class DebugText {
	constructor(
		private buffer: Uint8Array,
		private width: number,
		private height: number,
	) {}

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
		for (let row = 0; row < 8; row++) {
			const pixels = getFontRow(charCode, row);
			for (let col = 0; col < 8; col++) {
				if ((pixels >> (7 - col)) & 1) this.drawPixel(x + col, y + row, color);
			}
		}
	}

	public drawString(x: number, y: number, text: string, color: number) {
		let curX = x;
		for (let i = 0; i < text.length; i++) {
			this.drawChar(curX, y, text.charCodeAt(i), color);
			curX += 8;
		}
	}

	public drawCenteredString(y: number, text: string, color: number, backgroundColor?: number) {
		const textWidth = text.length * 8;
		const x = Math.floor((this.width - textWidth) / 2);
		if (backgroundColor !== undefined) this.drawRect(x - 2, y - 2, textWidth + 4, 11, backgroundColor);
		this.drawString(x, y, text, color);
	}
}
