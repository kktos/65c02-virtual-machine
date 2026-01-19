import {
	NATIVE_HEIGHT,
	NATIVE_WIDTH,
	SCREEN_MARGIN_X,
	SCREEN_MARGIN_Y,
	VIEW_AREA_HEIGHT,
	VIEW_AREA_WIDTH,
} from "./constants";

const HGR_WIDTH = 280;
const HGR_LINES = 192;
const HGR_MIXED_LINES = 160;

// Pre-calculated line base addresses for HGR screen memory
const HGR_LINE_ADDRS: ReadonlyArray<number> = Object.freeze([
	// Block 1: Lines 0-63
	0x2000, 0x2400, 0x2800, 0x2c00, 0x3000, 0x3400, 0x3800, 0x3c00, 0x2080, 0x2480, 0x2880, 0x2c80, 0x3080, 0x3480,
	0x3880, 0x3c80, 0x2100, 0x2500, 0x2900, 0x2d00, 0x3100, 0x3500, 0x3900, 0x3d00, 0x2180, 0x2580, 0x2980, 0x2d80,
	0x3180, 0x3580, 0x3980, 0x3d80, 0x2200, 0x2600, 0x2a00, 0x2e00, 0x3200, 0x3600, 0x3a00, 0x3e00, 0x2280, 0x2680,
	0x2a80, 0x2e80, 0x3280, 0x3680, 0x3a80, 0x3e80, 0x2300, 0x2700, 0x2b00, 0x2f00, 0x3300, 0x3700, 0x3b00, 0x3f00,
	0x2380, 0x2780, 0x2b80, 0x2f80, 0x3380, 0x3780, 0x3b80, 0x3f80,

	// Block 2: Lines 64-127
	0x2028, 0x2428, 0x2828, 0x2c28, 0x3028, 0x3428, 0x3828, 0x3c28, 0x20a8, 0x24a8, 0x28a8, 0x2ca8, 0x30a8, 0x34a8,
	0x38a8, 0x3ca8, 0x2128, 0x2528, 0x2928, 0x2d28, 0x3128, 0x3528, 0x3928, 0x3d28, 0x21a8, 0x25a8, 0x29a8, 0x2da8,
	0x31a8, 0x35a8, 0x39a8, 0x3da8, 0x2228, 0x2628, 0x2a28, 0x2e28, 0x3228, 0x3628, 0x3a28, 0x3e28, 0x22a8, 0x26a8,
	0x2aa8, 0x2ea8, 0x32a8, 0x36a8, 0x3aa8, 0x3ea8, 0x2328, 0x2728, 0x2b28, 0x2f28, 0x3328, 0x3728, 0x3b28, 0x3f28,
	0x23a8, 0x27a8, 0x2ba8, 0x2fa8, 0x33a8, 0x37a8, 0x3ba8, 0x3fa8,

	// Block 3: Lines 128-191
	0x2050, 0x2450, 0x2850, 0x2c50, 0x3050, 0x3450, 0x3850, 0x3c50, 0x20d0, 0x24d0, 0x28d0, 0x2cd0, 0x30d0, 0x34d0,
	0x38d0, 0x3cd0, 0x2150, 0x2550, 0x2950, 0x2d50, 0x3150, 0x3550, 0x3950, 0x3d50, 0x21d0, 0x25d0, 0x29d0, 0x2dd0,
	0x31d0, 0x35d0, 0x39d0, 0x3dd0, 0x2250, 0x2650, 0x2a50, 0x2e50, 0x3250, 0x3650, 0x3a50, 0x3e50, 0x22d0, 0x26d0,
	0x2ad0, 0x2ed0, 0x32d0, 0x36d0, 0x3ad0, 0x3ed0, 0x2350, 0x2750, 0x2b50, 0x2f50, 0x3350, 0x3750, 0x3b50, 0x3f50,
	0x23d0, 0x27d0, 0x2bd0, 0x2fd0, 0x33d0, 0x37d0, 0x3bd0, 0x3fd0,
]);

// HGR color palette (RGBA)
// Bit 7 controls color palette shift, bits 0-6 are pixel data
export const HGR_COLORS = [
	[0, 0, 0, 255], // Black
	[20, 245, 60, 255], // Green
	[255, 68, 253, 255], // Magenta/Purple
	[255, 255, 255, 255], // White
	[0, 0, 0, 255], // Black
	[255, 106, 60, 255], // Orange
	[20, 207, 253, 255], // Blue
	[255, 255, 255, 255], // White
];

const baseScaleX = VIEW_AREA_WIDTH / HGR_WIDTH;
const baseScaleY = VIEW_AREA_HEIGHT / HGR_LINES;
const baseOffsetX = SCREEN_MARGIN_X + (NATIVE_WIDTH - VIEW_AREA_WIDTH) / 2;
const baseOffsetY = SCREEN_MARGIN_Y + (NATIVE_HEIGHT - VIEW_AREA_HEIGHT) / 2;
const canvasW = NATIVE_WIDTH + SCREEN_MARGIN_X * 2;
const canvasH = NATIVE_HEIGHT + SCREEN_MARGIN_Y * 2;

export class HGRRenderer {
	constructor(
		private ram: Uint8Array,
		private buffer: Uint8Array,
		private targetWidth: number,
		private targetHeight: number,
	) {}

	public render(isMixed: boolean, isPage2: boolean): void {
		const baseAddr = isPage2 ? 0x2000 : 0;
		const ratioX = this.targetWidth / canvasW;
		const ratioY = this.targetHeight / canvasH;

		const destOffsetX = baseOffsetX * ratioX;
		const destOffsetY = baseOffsetY * ratioY;
		const unitX = baseScaleX * ratioX;
		const unitY = baseScaleY * ratioY;

		const endLine = isMixed ? HGR_MIXED_LINES : HGR_LINES;
		for (let y = 0; y < endLine; y++) {
			const lineBase = baseAddr + (HGR_LINE_ADDRS[y] ?? 0);
			const startY = Math.floor(destOffsetY + y * unitY);
			const endY = Math.floor(destOffsetY + (y + 1) * unitY);

			for (let byteX = 0; byteX < 40; byteX++) {
				const address = lineBase + byteX;
				const value = this.ram[address] ?? 0;
				const prevValue = byteX > 0 ? (this.ram[address - 1] ?? 0) : 0;
				const nextValue = byteX < 39 ? (this.ram[address + 1] ?? 0) : 0;

				const isShifted = (value & 0x80) !== 0;

				for (let bit = 0; bit < 7; bit++) {
					const dotX = byteX * 7 + bit;
					const isSet = (value & (1 << bit)) !== 0;

					let prevSet = false;
					if (bit > 0) prevSet = (value & (1 << (bit - 1))) !== 0;
					else prevSet = (prevValue & (1 << 6)) !== 0;

					let nextSet = false;
					if (bit < 6) nextSet = (value & (1 << (bit + 1))) !== 0;
					else nextSet = (nextValue & 1) !== 0;

					let colorIndex = 0; // Default Black

					// Determine the "Natural" color for this pixel position
					// Even: Violet (2) or Blue (6)
					// Odd:  Green (1) or Orange (5)
					const isEven = dotX % 2 === 0;
					let naturalColor = 0;
					let oppositeColor = 0;

					if (!isShifted) {
						naturalColor = isEven ? 2 : 1; // Violet : Green
						oppositeColor = isEven ? 1 : 2; // Green : Violet
					} else {
						naturalColor = isEven ? 6 : 5; // Blue : Orange
						oppositeColor = isEven ? 5 : 6; // Orange : Blue
					}

					if (isSet) {
						if (prevSet || nextSet) {
							colorIndex = 3; // White (adjacent bits are on)
						} else {
							colorIndex = naturalColor;
						}
					} else {
						// Gap filling: If we have a 101 pattern, fill the 0 with the color
						// implied by the surrounding 1s.
						if (prevSet && nextSet) {
							// The neighbors are ON. Since x-1 and x+1 have the same parity,
							// they imply the same color (e.g. Green).
							// We want to fill this pixel with that same color.
							// Since 'naturalColor' is for the current parity (which is opposite),
							// we use 'oppositeColor'.
							colorIndex = oppositeColor;
						} else {
							colorIndex = 0; // Black
						}
					}

					// Draw Scaled Pixel
					const startX = Math.floor(destOffsetX + dotX * unitX);
					const endX = Math.floor(destOffsetX + (dotX + 1) * unitX);
					const paletteIdx = 17 + colorIndex;

					for (let dy = startY; dy < endY; dy++) {
						const rowOffset = dy * this.targetWidth;
						for (let dx = startX; dx < endX; dx++) {
							this.buffer[rowOffset + dx] = paletteIdx;
						}
					}
				}
			}
		}
	}
}
