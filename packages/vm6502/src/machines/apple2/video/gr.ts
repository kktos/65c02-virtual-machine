import { SCREEN_MARGIN_Y, VIEW_AREA_HEIGHT, VIEW_AREA_WIDTH } from "./constants";

const GR_WIDTH = 40;
const GR_LINES = 48;
const GR_MIXED_LINES = 40;

const scaleX = VIEW_AREA_WIDTH / GR_WIDTH;
const scaleY = VIEW_AREA_HEIGHT / GR_LINES;

// Text Screen Line Offsets (same as Text mode)
const GR_LINE_OFFSETS = [
	0x400, 0x480, 0x500, 0x580, 0x600, 0x680, 0x700, 0x780, 0x428, 0x4a8, 0x528, 0x5a8, 0x628, 0x6a8, 0x728, 0x7a8, 0x450,
	0x4d0, 0x550, 0x5d0, 0x650, 0x6d0, 0x750, 0x7d0,
];

export class LowGrRenderer {
	public offsetX = 0;
	public offsetY = 0;

	constructor(
		private ram: Uint8Array,
		private buffer: Uint8Array,
		private targetWidth: number,
		targetHeight: number,
	) {
		this.offsetX = (targetWidth - VIEW_AREA_WIDTH) / 2;
		this.offsetY = SCREEN_MARGIN_Y + (targetHeight - VIEW_AREA_HEIGHT) / 2;
	}

	public render(isMixed: boolean, isPage2: boolean): void {
		const pageOffset = isPage2 ? 0x400 : 0;
		const endLine = isMixed ? GR_MIXED_LINES : GR_LINES;
		for (let y = 0; y < endLine; y++) {
			const textRow = y >> 1;
			const isBottom = (y & 1) !== 0;
			const lineBase = (GR_LINE_OFFSETS[textRow] ?? 0) + pageOffset;

			const startY = Math.floor(this.offsetY + y * scaleY);
			const endY = Math.floor(this.offsetY + (y + 1) * scaleY);

			for (let x = 0; x < GR_WIDTH; x++) {
				const val = this.ram[lineBase + x] ?? 0;
				const colorIdx = isBottom ? val >> 4 : val & 0x0f;

				const startX = Math.floor(this.offsetX + x * scaleX);
				const endX = Math.floor(this.offsetX + (x + 1) * scaleX);

				for (let dy = startY; dy < endY; dy++) {
					const rowOffset = dy * this.targetWidth;
					for (let dx = startX; dx < endX; dx++) {
						this.buffer[rowOffset + dx] = colorIdx;
					}
				}
			}
		}
	}
}
