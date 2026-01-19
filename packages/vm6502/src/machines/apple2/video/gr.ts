import { NATIVE_VIEW_WIDTH, SCREEN_MARGIN_X, SCREEN_MARGIN_Y } from "./constants";

const GR_WIDTH = 40;
const GR_LINES = 48;
const GR_MIXED_LINES = 40;

// Text Screen Line Offsets (same as Text mode)
const GR_LINE_OFFSETS = [
	0x400, 0x480, 0x500, 0x580, 0x600, 0x680, 0x700, 0x780, 0x428, 0x4a8, 0x528, 0x5a8, 0x628, 0x6a8, 0x728, 0x7a8, 0x450,
	0x4d0, 0x550, 0x5d0, 0x650, 0x6d0, 0x750, 0x7d0,
];

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
		// const screenAreaWidth = width - SCREEN_MARGIN_X * 2;
		// const screenAreaHeight = height - SCREEN_MARGIN_Y * 2;
		// this.scaleX = screenAreaWidth / GR_WIDTH;
		// this.scaleY = screenAreaHeight / GR_LINES;
		this.scaleX = (width + SCREEN_MARGIN_X * 2) / GR_WIDTH;
		this.scaleY = (height + SCREEN_MARGIN_Y * 2) / GR_LINES;
		this.offsetX = (width - NATIVE_VIEW_WIDTH) / 2; //SCREEN_MARGIN_X;
		this.offsetY = SCREEN_MARGIN_Y;
	}

	public render(isMixed: boolean, isPage2: boolean): void {
		const pageOffset = isPage2 ? 0x400 : 0;
		const endLine = isMixed ? GR_MIXED_LINES : GR_LINES;
		for (let y = 0; y < endLine; y++) {
			const textRow = y >> 1;
			const isBottom = (y & 1) !== 0;
			const lineBase = (GR_LINE_OFFSETS[textRow] ?? 0) + pageOffset;

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
