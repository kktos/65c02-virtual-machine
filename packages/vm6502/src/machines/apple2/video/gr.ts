import {
	NATIVE_HEIGHT,
	NATIVE_WIDTH,
	SCREEN_MARGIN_X,
	SCREEN_MARGIN_Y,
	VIEW_AREA_HEIGHT,
	VIEW_AREA_WIDTH,
} from "./constants";

export const GR_WIDTH = 40;
export const GR_LINES = 48;
export const GR_MIXED_LINES = 40;

const scaleX = VIEW_AREA_WIDTH / GR_WIDTH;
const scaleY = VIEW_AREA_HEIGHT / GR_LINES;
const offsetX = SCREEN_MARGIN_X + (NATIVE_WIDTH - VIEW_AREA_WIDTH) / 2;
const offsetY = SCREEN_MARGIN_Y + (NATIVE_HEIGHT - VIEW_AREA_HEIGHT) / 2;
const canvasW = NATIVE_WIDTH + SCREEN_MARGIN_X * 2;
const canvasH = NATIVE_HEIGHT + SCREEN_MARGIN_Y * 2;

// Text Screen Line Offsets (same as Text mode)
const GR_LINE_OFFSETS = [
	0x400, 0x480, 0x500, 0x580, 0x600, 0x680, 0x700, 0x780, 0x428, 0x4a8, 0x528, 0x5a8, 0x628, 0x6a8, 0x728, 0x7a8, 0x450,
	0x4d0, 0x550, 0x5d0, 0x650, 0x6d0, 0x750, 0x7d0,
];

export class LowGrRenderer {
	public offsetY = 0;

	constructor(
		private ctx: OffscreenCanvasRenderingContext2D,
		private ram: Uint8Array,
		private buffer: Uint8Array,
	) {}

	public render(startLine: number, endLine: number, isPage2: boolean, colors: string[]): void {
		const pageOffset = isPage2 ? 0x400 : 0;

		this.ctx.save();
		this.ctx.translate(offsetX, offsetY);

		for (let y = startLine; y < endLine; y++) {
			const textRow = y >> 1;
			const isBottom = (y & 1) !== 0;
			const lineBase = (GR_LINE_OFFSETS[textRow] ?? 0) + pageOffset;

			for (let x = 0; x < GR_WIDTH; x++) {
				const val = this.ram[lineBase + x] ?? 0;
				const colorIdx = isBottom ? val >> 4 : val & 0x0f;

				// biome-ignore lint/style/noNonNullAssertion: <known palette>
				this.ctx.fillStyle = colors[colorIdx]!;
				this.ctx.fillRect(x * scaleX, y * scaleY, scaleX, scaleY);
			}
		}
		this.ctx.restore();
	}

	public renderBuffer(
		targetWidth: number,
		targetHeight: number,
		startLine: number,
		endLine: number,
		isPage2: boolean,
	): void {
		const pageOffset = isPage2 ? 0x400 : 0;

		// Calculate scaling factors relative to the virtual canvas size
		const ratioX = targetWidth / canvasW;
		const ratioY = targetHeight / canvasH;

		// Calculate the destination offset and scale for the GR content
		const destOffsetX = offsetX * ratioX;
		const destOffsetY = offsetY * ratioY;
		this.offsetY = destOffsetY;
		const unitX = scaleX * ratioX;
		const unitY = scaleY * ratioY;

		for (let y = startLine; y < endLine; y++) {
			const textRow = y >> 1;
			const isBottom = (y & 1) !== 0;
			const lineBase = (GR_LINE_OFFSETS[textRow] ?? 0) + pageOffset;

			const startY = Math.floor(destOffsetY + y * unitY);
			const endY = Math.floor(destOffsetY + (y + 1) * unitY);

			for (let x = 0; x < GR_WIDTH; x++) {
				const val = this.ram[lineBase + x] ?? 0;
				const colorIdx = isBottom ? val >> 4 : val & 0x0f;

				const startX = Math.floor(destOffsetX + x * unitX);
				const endX = Math.floor(destOffsetX + (x + 1) * unitX);

				for (let dy = startY; dy < endY; dy++) {
					const rowOffset = dy * targetWidth;
					for (let dx = startX; dx < endX; dx++) {
						this.buffer[rowOffset + dx] = colorIdx;
					}
				}
			}
		}
	}
}
