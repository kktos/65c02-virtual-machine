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

// Text Screen Line Offsets (same as Text mode)
const GR_LINE_OFFSETS = [
	0x400, 0x480, 0x500, 0x580, 0x600, 0x680, 0x700, 0x780, 0x428, 0x4a8, 0x528, 0x5a8, 0x628, 0x6a8, 0x728, 0x7a8, 0x450,
	0x4d0, 0x550, 0x5d0, 0x650, 0x6d0, 0x750, 0x7d0,
];

export function renderGr(
	ctx: OffscreenCanvasRenderingContext2D,
	ram: Uint8Array,
	startLine: number,
	endLine: number,
	isPage2: boolean,
	colors: string[],
): void {
	const pageOffset = isPage2 ? 0x400 : 0;
	const scaleX = VIEW_AREA_WIDTH / GR_WIDTH;
	const scaleY = VIEW_AREA_HEIGHT / GR_LINES;

	const offsetX = SCREEN_MARGIN_X + (NATIVE_WIDTH - VIEW_AREA_WIDTH) / 2;
	const offsetY = SCREEN_MARGIN_Y + (NATIVE_HEIGHT - VIEW_AREA_HEIGHT) / 2;

	ctx.save();
	ctx.translate(offsetX, offsetY);

	for (let y = startLine; y < endLine; y++) {
		const textRow = y >> 1;
		const isBottom = (y & 1) !== 0;
		const lineBase = (GR_LINE_OFFSETS[textRow] ?? 0) + pageOffset;

		for (let x = 0; x < GR_WIDTH; x++) {
			const val = ram[lineBase + x] ?? 0;
			const colorIdx = isBottom ? val >> 4 : val & 0x0f;

			ctx.fillStyle = colors[colorIdx]!;
			ctx.fillRect(x * scaleX, y * scaleY, scaleX, scaleY);
		}
	}
	ctx.restore();
}
