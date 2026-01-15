import type { Video } from "@/types/video.interface";
import type { IBus } from "@/virtualmachine/cpu/bus.interface";
import type { AppleBus } from "./apple.bus";
import * as SoftSwitches from "./bus/softswitches";

type CharMetrics = {
	charWidth: number;
	charHeight: number;
	cols: number;
	rows: number;
	offsetTop: number;
	offsetLeft: number;
};

const TEXT_ROWS = 24;
const TEXT_COLS = 40;

// Offsets for each of the 24 lines in the text screen memory
// Includes the Text Page 1 Base ($400)
const textScreenLineOffsets = [
	0x400, 0x480, 0x500, 0x580, 0x600, 0x680, 0x700, 0x780, 0x428, 0x4a8, 0x528, 0x5a8, 0x628, 0x6a8, 0x728, 0x7a8, 0x450,
	0x4d0, 0x550, 0x5d0, 0x650, 0x6d0, 0x750, 0x7d0,
];

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
const COLORS = [
	[0, 0, 0, 255], // Black
	[20, 245, 60, 255], // Green
	[255, 68, 253, 255], // Magenta/Purple
	[255, 255, 255, 255], // White
	[0, 0, 0, 255], // Black
	[255, 106, 60, 255], // Orange
	[20, 207, 253, 255], // Blue
	[255, 255, 255, 255], // White
];

const IIgsPaletteRGB: ReadonlyArray<[number, number, number]> = [
	[0x00, 0x00, 0x00], // 0 Black
	[0xdd, 0x00, 0x30], // 1 Deep Red
	[0x00, 0x00, 0x99], // 2 Dark Blue
	[0xdd, 0x22, 0xdd], // 3 Purple
	[0x00, 0x77, 0x22], // 4 Dark Green
	[0x55, 0x55, 0x55], // 5 Dark Gray
	[0x22, 0x22, 0xff], // 6 Medium Blue
	[0x66, 0xaa, 0xff], // 7 Light Blue
	[0x88, 0x55, 0x00], // 8 Brown
	[0xff, 0x66, 0x00], // 9 Orange
	[0xaa, 0xaa, 0xaa], // 10 Light Gray
	[0xff, 0x99, 0x88], // 11 Pink
	[0x11, 0xdd, 0x00], // 12 Light Green
	[0xff, 0xff, 0x00], // 13 Yellow
	[0x41, 0xff, 0x99], // 14 Aquamarine
	[0xff, 0xff, 0xff], // 15 White
];

const HGR_WIDTH = 280;
const HGR_LINES = 192;
const HGR_MIXED_LINES = 160;

const SCREEN_MARGIN_X = 10;
const SCREEN_MARGIN_Y = 10;
const NATIVE_WIDTH = 640; //480;
const NATIVE_HEIGHT = 25 * 21;

const AUX_BANK_OFFSET = 0x10000;

interface AppleVideoOverrides {
	videoMode?: "AUTO" | "TEXT" | "HGR";
	videoPage?: "AUTO" | "PAGE1" | "PAGE2";
	textRenderer?: "BITMAP" | "FONT";
	borderColor: number;
	textFgColor: number;
	textBgColor: number;
	wannaScale?: boolean;
	mouseChars?: "AUTO" | "ON" | "OFF";
}

function appleCharCodeToUnicode(charCode: number, isAltCharset = false): string {
	// let charCode = asciiCode;
	if (charCode <= 0x1f) charCode += 0xe140;
	else if (charCode <= 0x3f) charCode += 0xe100;
	else if (charCode <= 0x5f) {
		charCode += isAltCharset ? 0xe040 : 0xe100;
	} else if (charCode <= 0x7f)
		charCode += 0xe0c0; // $60-$7F -> $E120-$E13F
	else if (charCode < 0xa0) charCode -= 0x40;
	else if (charCode >= 0xa0) charCode -= 0x80;

	return String.fromCharCode(charCode);
}

const baseurl = import.meta.url.match(/http:\/\/[^/]+/)?.[0];
function loadFont(name: string) {
	const fontUrl = new URL(`${baseurl}/fonts/${name}.ttf`).href;
	const font = new FontFace(name, `url(${fontUrl})`);
	font
		.load()
		.then((loaded) => {
			self.fonts.add(loaded);
			console.log("AppleVideo: Loaded font", loaded.family);
		})
		.catch((e) => console.warn("Failed to load font in worker:", e));
}
export class AppleVideo implements Video {
	private parent: Worker;
	private buffer: Uint8Array;
	private bus: AppleBus;
	private offscreenCanvas: OffscreenCanvas;
	private ctx: OffscreenCanvasRenderingContext2D;
	private targetWidth: number;
	private targetHeight: number;

	private readonly charWidth: number;
	private readonly charHeight: number;

	private charmap40: ImageBitmap | null = null;
	private metrics40: CharMetrics | null = null;
	private charmap80: ImageBitmap | null = null;
	private metrics80: CharMetrics | null = null;

	private flashCounter = 0;
	private flashState = false;

	private overrides: AppleVideoOverrides = { borderColor: -1, textFgColor: -1, textBgColor: -1 };

	constructor(parent: Worker, mem: Uint8Array, width: number, height: number, bus: IBus, payload?: unknown) {
		this.parent = parent;
		this.buffer = mem;
		this.bus = bus as AppleBus;
		this.targetWidth = width;
		this.targetHeight = height;
		this.offscreenCanvas = new OffscreenCanvas(NATIVE_WIDTH + SCREEN_MARGIN_X * 2, NATIVE_HEIGHT + SCREEN_MARGIN_Y * 2);
		const context = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Could not get 2D context from OffscreenCanvas");

		loadFont("PrintChar21");
		loadFont("PRNumber3");

		this.ctx = context;
		this.ctx.imageSmoothingEnabled = false;

		this.charWidth = NATIVE_WIDTH / TEXT_COLS;
		this.charHeight = NATIVE_HEIGHT / TEXT_ROWS;

		console.log("AppleVideo", `view w${width}h${height}`, `char w${this.charWidth}h${this.charHeight}`);

		this.initPalette();

		if (payload?.charmap40) {
			this.charmap40 = payload.charmap40;
			this.metrics40 = payload.metrics40;
			this.charmap80 = payload.charmap80;
			this.metrics80 = payload.metrics80;
		}
	}

	private initPalette() {
		const palette = new Uint8Array(256 * 4);
		// IIgs 16-color palette
		for (let i = 0; i < 16; i++) {
			palette[i * 4 + 0] = IIgsPaletteRGB[i]![0];
			palette[i * 4 + 1] = IIgsPaletteRGB[i]![1];
			palette[i * 4 + 2] = IIgsPaletteRGB[i]![2];
			palette[i * 4 + 3] = 0xff;
		}

		// HGR color palette
		for (let i = 17; i < 17 + 8; i++) {
			palette[i * 4 + 0] = COLORS[i - 17]![0];
			palette[i * 4 + 1] = COLORS[i - 17]![1];
			palette[i * 4 + 2] = COLORS[i - 17]![2];
			palette[i * 4 + 3] = 0xff;
		}

		this.parent.postMessage({ command: "setPalette", colors: palette });
	}

	private findNearestColor(r: number, g: number, b: number): number {
		let minDist = Infinity;
		let bestIndex = 0;

		for (let i = 0; i < 16; i++) {
			const p = IIgsPaletteRGB[i] as [number, number, number];
			const dr = r - p[0];
			const dg = g - p[1];
			const db = b - p[2];
			const dist = dr * dr + dg * dg + db * db;

			if (dist < minDist) {
				minDist = dist;
				bestIndex = i;
				if (dist === 0) break;
			}
		}
		return bestIndex;
	}

	public setDebugOverrides(overrides: Record<string, unknown>) {
		this.overrides = overrides as unknown as AppleVideoOverrides;
	}

	public tick() {
		// --- TBCOLOR Handling ---
		// 1. Apply overrides to bus.tbColor if present
		let tbColor = this.bus.tbColor;
		if (this.overrides.textBgColor >= 0) {
			const bgIdx = this.overrides.textBgColor;
			tbColor = (tbColor & 0xf0) | (bgIdx & 0x0f);
		}
		if (this.overrides.textFgColor >= 0) {
			const fgIdx = this.overrides.textFgColor;
			tbColor = (tbColor & 0x0f) | ((fgIdx & 0x0f) << 4);
		}
		// Write back to bus if changed (so software sees the override)
		this.bus.tbColor = tbColor;

		// 2. Derive rendering colors from tbColor
		const bgIdx = tbColor & 0x0f;
		const fgIdx = (tbColor >> 4) & 0x0f;
		// biome-ignore lint/style/noNonNullAssertion: <np>
		const bgColorStr = `rgb(${IIgsPaletteRGB[bgIdx]!.join(",")})`;
		// biome-ignore lint/style/noNonNullAssertion: <np>
		const fgColorStr = `rgb(${IIgsPaletteRGB[fgIdx]!.join(",")})`;

		let borderIdx = this.bus.brdrColor & 0x0f;
		if (this.overrides.borderColor >= 0) borderIdx = this.overrides.borderColor;
		this.bus.brdrColor = borderIdx;

		// biome-ignore lint/style/noNonNullAssertion: <np>
		this.ctx.fillStyle = `rgb(${IIgsPaletteRGB[borderIdx]!.join(",")})`;
		this.ctx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

		this.flashCounter++;
		if (this.flashCounter >= 16) {
			this.flashState = !this.flashState;
			this.flashCounter = 0;
		}

		let isText = (this.bus.read(SoftSwitches.TEXT) & 0x80) !== 0;
		let isHgr = (this.bus.read(SoftSwitches.HIRES) & 0x80) !== 0;
		const isMixed = (this.bus.read(SoftSwitches.MIXED) & 0x80) !== 0;
		const is80Col = (this.bus.read(SoftSwitches.COL80) & 0x80) !== 0;
		let isPage2 = (this.bus.read(SoftSwitches.PAGE2) & 0x80) !== 0;

		if (this.overrides.videoMode === "TEXT") {
			isText = true;
		} else if (this.overrides.videoMode === "HGR") {
			isText = false;
			isHgr = true;
		}

		if (this.overrides.videoPage === "PAGE1") {
			isPage2 = false;
		} else if (this.overrides.videoPage === "PAGE2") {
			isPage2 = true;
		}

		if (isText) {
			if (is80Col) this.renderText80(0, TEXT_ROWS);
			else this.renderText40(0, TEXT_ROWS, isPage2, bgColorStr, fgColorStr);
		} else if (isHgr) {
			this.renderHgr(0, isMixed ? HGR_MIXED_LINES : HGR_LINES, isPage2);
			if (isMixed) {
				if (is80Col) this.renderText80(20, 24);
				else this.renderText40(20, 24, isPage2, bgColorStr, fgColorStr);
			}
		}

		const dest = this.buffer;
		const scaleY = this.targetHeight / this.offscreenCanvas.height;

		// Only read back from canvas if we rendered text
		if (isText || isMixed) {
			const imageData = this.ctx.getImageData(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
			const src32 = new Uint32Array(imageData.data.buffer);
			const srcWidth = this.offscreenCanvas.width;

			const useThresholding = this.overrides.textRenderer === "FONT";
			const colorCache = useThresholding ? null : new Map<number, number>();

			// When using font rendering, we combat anti-aliasing by snapping each pixel
			// to either the intended foreground, text background, or global background color.

			// biome-ignore lint/style/noNonNullAssertion: <np>
			const fgRgb = IIgsPaletteRGB[fgIdx]!;
			// biome-ignore lint/style/noNonNullAssertion: <np>
			const textBgRgb = IIgsPaletteRGB[bgIdx]!;
			// biome-ignore lint/style/noNonNullAssertion: <np>
			const globalBgRgb = IIgsPaletteRGB[borderIdx]!;

			const textBgIndex = bgIdx;
			const fgIndex = fgIdx;
			const globalBgIndex = borderIdx;

			let startY = 0;
			if (isMixed && !isText) {
				// Mixed Mode: Copy only the bottom 4 lines of text (lines 20-23)
				// Start at line 160 (Mixed mode split point)
				// We need to calculate the Y position in the TARGET buffer
				startY = Math.floor((SCREEN_MARGIN_Y + 160) * scaleY);
			}

			// Convert RGBA pixels to 8-bit indices
			// We loop over the DESTINATION buffer dimensions
			for (let y = startY; y < this.targetHeight; y++) {
				const srcY = Math.floor(y / scaleY);
				const srcRowOffset = srcY * srcWidth;
				const destRowOffset = y * this.targetWidth;

				for (let x = 0; x < this.targetWidth; x++) {
					// Simple nearest neighbor for X (assuming width matches for now, but safe to scale)
					// If targetWidth == srcWidth (560), this maps 1:1
					const pixel = src32[srcRowOffset + x] ?? 0;
					let colorIndex: number;

					if (useThresholding) {
						const r = pixel & 0xff;
						const g = (pixel >> 8) & 0xff;
						const b = (pixel >> 16) & 0xff;

						// Calculate squared distance to global background, text background, and foreground
						const distToGlobalBg = (r - globalBgRgb[0]) ** 2 + (g - globalBgRgb[1]) ** 2 + (b - globalBgRgb[2]) ** 2;
						const distToTextBg = (r - textBgRgb[0]) ** 2 + (g - textBgRgb[1]) ** 2 + (b - textBgRgb[2]) ** 2;
						const distToFg = (r - fgRgb[0]) ** 2 + (g - fgRgb[1]) ** 2 + (b - fgRgb[2]) ** 2;

						if (distToFg <= distToTextBg && distToFg <= distToGlobalBg) {
							colorIndex = fgIndex;
						} else if (distToTextBg <= distToGlobalBg) {
							colorIndex = textBgIndex;
						} else {
							colorIndex = globalBgIndex;
						}
					} else {
						const key = pixel & 0x00ffffff;
						colorIndex = colorCache!.get(key);
						if (colorIndex === undefined) {
							const r = pixel & 0xff;
							const g = (pixel >> 8) & 0xff;
							const b = (pixel >> 16) & 0xff;
							colorIndex = this.findNearestColor(r, g, b);
							colorCache!.set(key, colorIndex);
						}
					}

					dest[destRowOffset + x] = colorIndex;
				}
			}
		}

		if ((globalThis as any).DEBUG_VIDEO) this.handleDebugVideo();
	}

	/**
	 * Renders the Apple IIe HGR screen into the video buffer.
	 */
	private renderHgr(startLine = 0, endLine = HGR_LINES, isPage2: boolean): void {
		const baseAddr = isPage2 ? 0x2000 : 0;
		const scaleX = this.targetWidth / HGR_WIDTH;
		const scaleY = this.targetHeight / HGR_LINES;

		for (let y = startLine; y < endLine; y++) {
			const lineBase = baseAddr + (HGR_LINE_ADDRS[y] ?? 0);
			const startY = Math.floor(y * scaleY);
			const endY = Math.floor((y + 1) * scaleY);

			for (let byteX = 0; byteX < 40; byteX++) {
				const address = lineBase + byteX;
				const value = this.bus.readRaw?.(address) ?? 0;
				const prevValue = byteX > 0 ? (this.bus.readRaw?.(address - 1) ?? 0) : 0;
				const nextValue = byteX < 39 ? (this.bus.readRaw?.(address + 1) ?? 0) : 0;

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
					const startX = Math.floor(dotX * scaleX);
					const endX = Math.floor((dotX + 1) * scaleX);
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

	private handleDebugVideo() {
		(globalThis as any).DEBUG_VIDEO = false;
		this.offscreenCanvas.convertToBlob().then((blob) => {
			const reader = new FileReader();
			reader.onload = () => {
				const url = reader.result as string;
				console.log("AppleVideo Canvas Snapshot:", this.offscreenCanvas.width, this.offscreenCanvas.height);
				console.log(
					"%c  ",
					`font-size: 1px; padding: ${this.offscreenCanvas.height / 2}px ${this.offscreenCanvas.width / 2}px; background: url(${url}) no-repeat; background-size: contain;`,
				);
			};
			reader.readAsDataURL(blob);
		});

		// Reconstruct image from the buffer to verify the copy process
		const width = this.targetWidth;
		const height = this.targetHeight;
		const debugCanvas = new OffscreenCanvas(width, height);
		const debugCtx = debugCanvas.getContext("2d");
		if (debugCtx) {
			const imgData = debugCtx.createImageData(width, height);
			for (let i = 0; i < width * height; i++) {
				const colorIdx = this.buffer[i];
				const rgb = IIgsPaletteRGB[colorIdx & 0x0f] || [0, 0, 0];
				imgData.data[i * 4 + 0] = rgb[0];
				imgData.data[i * 4 + 1] = rgb[1];
				imgData.data[i * 4 + 2] = rgb[2];
				imgData.data[i * 4 + 3] = 255;
			}
			debugCtx.putImageData(imgData, 0, 0);
			debugCanvas.convertToBlob().then((blob) => {
				const reader = new FileReader();
				reader.onload = () => {
					const url = reader.result as string;
					console.log("AppleVideo Buffer Snapshot:", width, height);
					console.log(
						"%c  ",
						`font-size: 1px; padding: ${height / 2}px ${width / 2}px; background: url(${url}) no-repeat; background-size: contain;`,
					);
				};
				reader.readAsDataURL(blob);
			});
		}

		// Lorem Ipsum Debug
		const padding = 2;
		const cellWidth = this.charWidth + padding * 2;
		const cellHeight = this.charHeight + padding * 2;
		const loremWidth = 40 * cellWidth;
		const loremHeight = 24 * cellHeight;

		const loremCanvas = new OffscreenCanvas(loremWidth, loremHeight);
		const loremCtx = loremCanvas.getContext("2d");

		if (loremCtx && this.charmap40 && this.metrics40) {
			// loremCtx.imageSmoothingEnabled = false;
			loremCtx.fillStyle = "black";
			loremCtx.fillRect(0, 0, loremWidth, loremHeight);

			// const text =
			// 	"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

			let charIndex = 0;
			for (let y = 0; y < 24; y++) {
				for (let x = 0; x < 40; x++) {
					const charCode = (charIndex % 255) | 0x80; //text.charCodeAt(charIndex % text.length) | 0x80;
					charIndex++;

					const destX = x * cellWidth + padding;
					const destY = y * cellHeight + padding;

					const m = this.metrics40;
					const srcX = (charCode % m.cols) * m.charWidth;
					const srcY = Math.floor(charCode / m.rows) * m.charHeight;

					if (charIndex === 56)
						loremCtx.drawImage(
							this.charmap40,
							srcX,
							srcY,
							m.charWidth,
							m.charHeight,
							destX,
							destY,
							this.charWidth,
							this.charHeight,
						);
				}
			}

			loremCanvas.convertToBlob().then((blob) => {
				const reader = new FileReader();
				reader.onload = () => {
					const url = reader.result as string;
					console.log("AppleVideo Lorem Ipsum Snapshot:", loremWidth, loremHeight);
					console.log(
						"%c  ",
						`font-size: 1px; padding: ${loremHeight / 2}px ${loremWidth / 2}px; background: url(${url}) no-repeat; background-size: contain;`,
					);
				};
				reader.readAsDataURL(blob);
			});
		}
	}

	private drawChar(charCode: number, x: number, y: number, width: number, is80Col: boolean) {
		const charmap = is80Col ? this.charmap80 : this.charmap40;
		const metrics = is80Col ? this.metrics80 : this.metrics40;

		if (!charmap || !metrics) return;

		// Calculate source position in atlas (simple math, very fast)
		const col = charCode % metrics.cols;
		const row = Math.floor(charCode / metrics.rows);

		const srcX = col * metrics.charWidth;
		const srcY = row * metrics.charHeight;

		// Draw from atlas
		this.ctx.drawImage(
			charmap,
			srcX,
			srcY,
			metrics.charWidth,
			metrics.charHeight, // source
			x,
			y,
			width,
			this.charHeight, // destination
		);
	}

	private renderText40(startRow = 0, endRow = TEXT_ROWS, isPage2 = false, bgColorStr = "black", fgColorStr = "white") {
		if (this.overrides.textRenderer === "FONT")
			return this.renderText40WithFont(startRow, endRow, isPage2, bgColorStr, fgColorStr);

		const pageOffset = isPage2 ? 0x400 : 0;
		for (let y = startRow; y < endRow; y++) {
			const lineBase = (textScreenLineOffsets[y] ?? 0) + pageOffset;
			for (let x = 0; x < TEXT_COLS; x++) {
				const charCode = this.bus.readRaw?.(lineBase + x) ?? 0;

				const drawX = SCREEN_MARGIN_X + x * this.charWidth;
				const drawY = SCREEN_MARGIN_Y + y * this.charHeight;

				this.drawChar(charCode, drawX, drawY, this.charWidth, false);
			}
		}
	}

	private renderText80(startRow = 0, endRow = TEXT_ROWS) {
		if (this.overrides.textRenderer === "FONT") return this.renderText80WithFont(startRow, endRow);

		const charWidth80 = this.charWidth / 2;
		for (let y = startRow; y < endRow; y++) {
			const lineBase = textScreenLineOffsets[y] ?? 0;
			for (let x = 0; x < TEXT_COLS; x++) {
				const drawY = SCREEN_MARGIN_Y + y * this.charHeight;

				// Aux char (Even column)
				const auxVal = this.bus.readRaw?.(AUX_BANK_OFFSET + lineBase + x) ?? 0;
				const drawXAux = SCREEN_MARGIN_X + x * 2 * charWidth80;
				this.drawChar(auxVal, drawXAux, drawY, charWidth80, true);

				// Main char (Odd column)
				const mainVal = this.bus.readRaw?.(lineBase + x) ?? 0;
				const drawXMain = SCREEN_MARGIN_X + (x * 2 + 1) * charWidth80;
				this.drawChar(mainVal, drawXMain, drawY, charWidth80, true);
			}
		}
	}

	private renderText40WithFont(
		startRow = 0,
		endRow = TEXT_ROWS,
		isPage2 = false,
		bgColorStr: string,
		fgColorStr: string,
	) {
		const charHeight = 16;
		const charWidth = 14;

		this.ctx.font = `${charHeight}px PrintChar21`;
		this.ctx.textBaseline = "top";
		this.ctx.textAlign = "left";

		const textBlockWidth = TEXT_COLS * charWidth;
		const textBlockHeight = TEXT_ROWS * charHeight;

		// Use separate scaling for X and Y to correct aspect ratio.
		// We limit vertical scale to match 80-column mode (based on 560px width)
		// while stretching horizontal to fill the screen.
		const referenceWidth = 560;
		const scaleY = this.overrides.wannaScale
			? Math.min(NATIVE_WIDTH / referenceWidth, NATIVE_HEIGHT / textBlockHeight)
			: 1;
		const scaleX = this.overrides.wannaScale ? NATIVE_WIDTH / textBlockWidth : 1;

		const scaledWidth = textBlockWidth * scaleX;
		const scaledHeight = textBlockHeight * scaleY;
		const offsetX = SCREEN_MARGIN_X + (NATIVE_WIDTH - scaledWidth) / 2;
		const offsetY = SCREEN_MARGIN_Y + (NATIVE_HEIGHT - scaledHeight) / 2;

		this.ctx.save();
		this.ctx.translate(offsetX, offsetY);
		if (this.overrides.wannaScale) this.ctx.scale(scaleX, scaleY);

		const pageOffset = isPage2 ? 0x400 : 0;
		// const bgColor = this.overrides.backgroundColor;
		// const drawBg = bgColor && bgColor !== "#000000";

		const isAltCharset =
			this.overrides.mouseChars === "ON" ||
			(this.overrides.mouseChars === "OFF" ? false : (this.bus.read(SoftSwitches.ALTCHARSET) & 0x80) !== 0);

		const wantNormal = !isAltCharset && !this.flashState;

		for (let y = startRow; y < endRow; y++) {
			const lineBase = (textScreenLineOffsets[y] ?? 0) + pageOffset;
			const drawY = y * charHeight;
			for (let x = 0; x < TEXT_COLS; x++) {
				let charCode = this.bus.readRaw?.(lineBase + x) ?? 0;
				const drawX = x * charWidth;

				this.ctx.fillStyle = bgColorStr;
				this.ctx.fillRect(drawX, drawY, charWidth, charHeight);

				if (wantNormal && charCode >= 0x40 && charCode <= 0x7f) charCode += 0x80;

				if (charCode === 0xa0) continue;

				this.ctx.fillStyle = fgColorStr;
				this.ctx.fillText(appleCharCodeToUnicode(charCode, isAltCharset), drawX, drawY);
			}
		}
		this.ctx.restore();
	}

	private renderText80WithFont(startRow = 0, endRow = TEXT_ROWS) {
		const charHeight = 16;
		const charWidth = 7;

		this.ctx.font = `${charHeight}px PRNumber3`;
		this.ctx.textBaseline = "top";
		this.ctx.textAlign = "left";

		const textBlockWidth = TEXT_COLS * 2 * charWidth;
		const textBlockHeight = TEXT_ROWS * charHeight;
		const scale = this.overrides.wannaScale
			? Math.min(NATIVE_WIDTH / textBlockWidth, NATIVE_HEIGHT / textBlockHeight)
			: 1;
		const scaledWidth = textBlockWidth * scale;
		const scaledHeight = textBlockHeight * scale;
		const offsetX = SCREEN_MARGIN_X + (NATIVE_WIDTH - scaledWidth) / 2;
		const offsetY = SCREEN_MARGIN_Y + (NATIVE_HEIGHT - scaledHeight) / 2;

		this.ctx.save();
		this.ctx.translate(offsetX, offsetY);
		if (this.overrides.wannaScale) this.ctx.scale(scale, scale);

		// Derive colors from tbColor
		const tbColor = this.bus.tbColor;
		const bgIdx = tbColor & 0x0f;
		const fgIdx = (tbColor >> 4) & 0x0f;
		const bgColorStr = `rgb(${IIgsPaletteRGB[bgIdx]!.join(",")})`;
		const fgColorStr = `rgb(${IIgsPaletteRGB[fgIdx]!.join(",")})`;

		const isAltCharset =
			this.overrides.mouseChars === "ON" ||
			(this.overrides.mouseChars === "OFF" ? false : (this.bus.read(SoftSwitches.ALTCHARSET) & 0x80) !== 0);

		const wantNormal = !isAltCharset && !this.flashState;

		for (let y = startRow; y < endRow; y++) {
			const lineBase = textScreenLineOffsets[y] ?? 0;
			const drawY = y * charHeight;

			for (let x = 0; x < TEXT_COLS; x++) {
				const evenCharX = x * 2 * charWidth;
				const oddCharX = evenCharX + charWidth;

				this.ctx.fillStyle = bgColorStr;
				this.ctx.fillRect(evenCharX, drawY, charWidth * 2, charHeight);
				this.ctx.fillStyle = fgColorStr;

				// Aux char (Even column)
				let auxVal = this.bus.readRaw?.(AUX_BANK_OFFSET + lineBase + x) ?? 0;
				if (wantNormal && auxVal >= 0x40 && auxVal <= 0x7f) auxVal += 0x80;
				if (auxVal !== 0xa0) this.ctx.fillText(appleCharCodeToUnicode(auxVal, isAltCharset), evenCharX, drawY);

				// Main char (Odd column)
				let mainVal = this.bus.readRaw?.(lineBase + x) ?? 0;
				if (wantNormal && mainVal >= 0x40 && mainVal <= 0x7f) mainVal += 0x80;
				if (mainVal !== 0xa0) this.ctx.fillText(appleCharCodeToUnicode(mainVal, isAltCharset), oddCharX, drawY);
			}
		}
		this.ctx.restore();
	}

	public reset() {
		this.buffer.fill(0);
		if (this.ctx) this.ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
	}
}
