import { NATIVE_VIEW_WIDTH, SCREEN_MARGIN_X, SCREEN_MARGIN_Y, textScreenLineOffsets } from "./constants";

const GR_WIDTH = 40;
const GR_LINES = 48;
const GR_MIXED_LINES = 40;

export class LowGrRenderer {
	public offsetX = 0;
	public offsetY = 0;
	private scaleX = 1;
	private scaleY = 1;
	private bufferWidth: number;

	constructor(
		private ram: Uint8Array,
		private buffer: Uint8Array,
		targetWidth: number,
		targetHeight: number,
	) {
		this.bufferWidth = targetWidth;
		this.resize(targetWidth, targetHeight);
	}

	public resize(width: number, height: number) {
		this.scaleX = (width + SCREEN_MARGIN_X * 2) / GR_WIDTH;
		this.scaleY = (height + SCREEN_MARGIN_Y * 2) / GR_LINES;
		this.offsetX = (width - NATIVE_VIEW_WIDTH) / 2;
		this.offsetY = SCREEN_MARGIN_Y;
	}

	public render(isMixed: boolean, isPage2: boolean): void {
		const pageOffset = isPage2 ? 0x400 : 0;
		const endLine = isMixed ? GR_MIXED_LINES : GR_LINES;
		for (let y = 0; y < endLine; y++) {
			const textRow = y >> 1;
			const isBottom = (y & 1) !== 0;
			const lineBase = (textScreenLineOffsets[textRow] ?? 0) + pageOffset;

			const startY = Math.floor(this.offsetY + y * this.scaleY);
			const endY = Math.floor(this.offsetY + (y + 1) * this.scaleY);

			for (let x = 0; x < GR_WIDTH; x++) {
				const val = this.ram[lineBase + x] ?? 0;
				const colorIdx = isBottom ? val >> 4 : val & 0x0f;

				const startX = Math.floor(this.offsetX + x * this.scaleX);
				const endX = Math.floor(this.offsetX + (x + 1) * this.scaleX);

				for (let dy = startY; dy < endY; dy++) {
					const rowOffset = dy * this.bufferWidth;
					for (let dx = startX; dx < endX; dx++) {
						this.buffer[rowOffset + dx] = colorIdx;
					}
				}
			}
		}
	}
}
