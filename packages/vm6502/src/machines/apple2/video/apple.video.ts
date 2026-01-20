import type { Video } from "@/types/video.interface";
import { MACHINE_STATE_OFFSET, REG_BORDERCOLOR_OFFSET, REG_TBCOLOR_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { LowGrRenderer } from "./gr";
import { HGR_COLORS, HGRRenderer } from "./hgr";
import { getFontColumn } from "./simple.font";
import { TextRenderer } from "./text";

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

// Memory layout offset (matches AppleBus)
const RAM_OFFSET = 0x4000;

// Machine State Flags (Byte 2 at MACHINE_STATE_OFFSET + 1)
const APPLE_80COL_MASK = 0b0000_0010;
const APPLE_ALTCHAR_MASK = 0b0000_0100;
const APPLE_TEXT_MASK = 0b0000_1000;
const APPLE_MIXED_MASK = 0b0001_0000;
const APPLE_PAGE2_MASK = 0b0010_0000;
const APPLE_HIRES_MASK = 0b0100_0000;

interface AppleVideoOverrides {
	videoMode?: "AUTO" | "TEXT" | "HGR";
	videoPage?: "AUTO" | "PAGE1" | "PAGE2";
	textRenderer?: "BITMAP" | "FONT";
	borderColor: number;
	textFgColor: number;
	textBgColor: number;
	wannaScale?: boolean;
	mouseChars?: "AUTO" | "ON" | "OFF";
	canvasSize?: "AUTO" | "CUSTOM";
	customWidth?: number;
	customHeight?: number;
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
	private registers: DataView;
	private ram: Uint8Array;
	private offscreenCanvas: OffscreenCanvas;
	private ctx: OffscreenCanvasRenderingContext2D;

	private targetWidth: number;
	private targetHeight: number;

	private defaultWidth: number;
	private defaultHeight: number;

	private overrides: AppleVideoOverrides = { borderColor: -1, textFgColor: -1, textBgColor: -1 };

	private textRenderer: TextRenderer;
	private lowGrRenderer: LowGrRenderer;
	private hgrRenderer: HGRRenderer;

	private renderText40!: (
		startRow: number,
		isPage2: boolean,
		bgColorStr: string,
		fgColorStr: string,
		isAltCharset: boolean,
	) => void;
	private renderText80!: (startRow: number, bgColorStr: string, fgColorStr: string, isAltCharset: boolean) => void;

	constructor(
		parent: Worker,
		mem: Uint8Array,
		width: number,
		height: number,
		registers: DataView,
		ram: Uint8Array,
		payload?: unknown,
	) {
		this.parent = parent;
		this.buffer = mem;
		this.registers = registers;
		this.ram = ram.subarray(RAM_OFFSET);

		this.targetWidth = width;
		this.targetHeight = height;
		this.defaultWidth = width;
		this.defaultHeight = height;

		this.offscreenCanvas = new OffscreenCanvas(width, height);
		const context = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Could not get 2D context from OffscreenCanvas");

		loadFont("PrintChar21");
		loadFont("PRNumber3");

		this.ctx = context;
		this.ctx.imageSmoothingEnabled = false;

		console.log("AppleVideo", `view w${width}h${height}`);

		this.initPalette();

		this.textRenderer = new TextRenderer(this.ctx, this.ram, payload, this.targetWidth, this.targetHeight);
		this.lowGrRenderer = new LowGrRenderer(this.ram, this.buffer, this.targetWidth, this.targetHeight);
		this.hgrRenderer = new HGRRenderer(this.ram, this.buffer, this.targetWidth, this.targetHeight);

		this.updateRenderers();
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
			palette[i * 4 + 0] = HGR_COLORS[i - 17]![0];
			palette[i * 4 + 1] = HGR_COLORS[i - 17]![1];
			palette[i * 4 + 2] = HGR_COLORS[i - 17]![2];
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

		let newWidth = this.defaultWidth;
		let newHeight = this.defaultHeight;

		if (this.overrides.canvasSize === "CUSTOM" && this.overrides.customWidth && this.overrides.customHeight) {
			newWidth = this.overrides.customWidth;
			newHeight = this.overrides.customHeight;
		}

		if (this.offscreenCanvas.width !== newWidth || this.offscreenCanvas.height !== newHeight) {
			this.offscreenCanvas.width = newWidth;
			this.offscreenCanvas.height = newHeight;
			this.textRenderer.resize(newWidth, newHeight);
			this.lowGrRenderer.resize(newWidth, newHeight);
			// this.hgrRenderer.resize(newWidth, newHeight);

			let borderIdx = this.registers.getUint8(REG_BORDERCOLOR_OFFSET) & 0x0f;
			if (this.overrides.borderColor >= 0) borderIdx = this.overrides.borderColor;
			this.buffer.fill(borderIdx);
		}

		this.updateRenderers();
	}

	private updateRenderers() {
		this.textRenderer.wannaScale = !!this.overrides.wannaScale;
		if (this.overrides.textRenderer === "FONT") {
			this.renderText40 = this.textRenderer.render40WithFont.bind(this.textRenderer);
			this.renderText80 = this.textRenderer.render80WithFont.bind(this.textRenderer);
		} else {
			this.renderText40 = this.textRenderer.render40Bitmap.bind(this.textRenderer);
			this.renderText80 = this.textRenderer.render80Bitmap.bind(this.textRenderer);
		}
	}

	public tick() {
		this.textRenderer.tick();

		// --- TBCOLOR Handling ---
		// 1. Apply overrides to bus.tbColor if present
		const tbColor = this.registers.getUint8(REG_TBCOLOR_OFFSET);
		// 2. Derive rendering colors from tbColor
		let bgIdx = tbColor & 0x0f;
		let fgIdx = (tbColor >> 4) & 0x0f;
		if (this.overrides.textBgColor >= 0) bgIdx = this.overrides.textBgColor;
		if (this.overrides.textFgColor >= 0) fgIdx = this.overrides.textFgColor;

		// biome-ignore lint/style/noNonNullAssertion: <np>
		const bgColorStr = `rgb(${IIgsPaletteRGB[bgIdx]!.join(",")})`;
		// biome-ignore lint/style/noNonNullAssertion: <np>
		const fgColorStr = `rgb(${IIgsPaletteRGB[fgIdx]!.join(",")})`;

		let borderIdx = this.registers.getUint8(REG_BORDERCOLOR_OFFSET) & 0x0f;
		if (this.overrides.borderColor >= 0) borderIdx = this.overrides.borderColor;

		// biome-ignore lint/style/noNonNullAssertion: <np>
		this.ctx.fillStyle = `rgb(${IIgsPaletteRGB[borderIdx]!.join(",")})`;
		this.ctx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
		this.buffer.fill(borderIdx);

		const stateByte2 = this.registers.getUint8(MACHINE_STATE_OFFSET + 1);

		let isText = (stateByte2 & APPLE_TEXT_MASK) !== 0;
		let isHgr = (stateByte2 & APPLE_HIRES_MASK) !== 0;
		const isMixed = (stateByte2 & APPLE_MIXED_MASK) !== 0;
		const is80Col = (stateByte2 & APPLE_80COL_MASK) !== 0;
		let isPage2 = (stateByte2 & APPLE_PAGE2_MASK) !== 0;

		if (this.overrides.videoMode === "TEXT") {
			isText = true;
		} else if (this.overrides.videoMode === "HGR") {
			isText = false;
			isHgr = true;
		}

		if (this.overrides.videoPage === "PAGE1") isPage2 = false;
		else if (this.overrides.videoPage === "PAGE2") isPage2 = true;

		const isAltCharset =
			this.overrides.mouseChars === "ON" ||
			(this.overrides.mouseChars === "OFF" ? false : (stateByte2 & APPLE_ALTCHAR_MASK) !== 0);

		if (isText) {
			if (is80Col) this.renderText80(0, bgColorStr, fgColorStr, isAltCharset);
			else this.renderText40(0, isPage2, bgColorStr, fgColorStr, isAltCharset);
		} else if (isHgr) {
			this.hgrRenderer.render(isMixed, isPage2);
			if (isMixed) {
				if (is80Col) this.renderText80(20, bgColorStr, fgColorStr, isAltCharset);
				else this.renderText40(20, isPage2, bgColorStr, fgColorStr, isAltCharset);
			}
		} else {
			this.lowGrRenderer.render(isMixed, isPage2);
			if (isMixed) {
				if (is80Col) this.renderText80(20, bgColorStr, fgColorStr, isAltCharset);
				else this.renderText40(20, isPage2, bgColorStr, fgColorStr, isAltCharset);
			}

			this.drawDebugString(100, 350, "test", 15);
		}

		const dest = this.buffer;
		const scaleY = this.targetHeight / this.offscreenCanvas.height;

		const useBufferForGr = !isText && !isHgr;
		const directRender = isHgr || useBufferForGr;

		// Only read back from canvas if we rendered text or GR (anything not HGR-only)
		if (!directRender || isMixed) {
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
			if (isMixed && directRender) {
				// Mixed Mode: Copy only the bottom 4 lines of text (lines 20-23)
				// We calculate the starting Y in the destination buffer based on where
				// the text renderer placed the text on the source canvas.
				const textRowHeight = 16;
				const canvasTextStartY = this.textRenderer.offsetY + 20 * textRowHeight * this.textRenderer.scaleY;
				startY = Math.floor(canvasTextStartY * scaleY);
			}

			// Convert RGBA pixels to 8-bit indices
			// We loop over the DESTINATION buffer dimensions
			for (let y = startY; y < this.targetHeight; y++) {
				// const srcY = Math.floor(y / scaleY);
				let srcY: number;
				if (isMixed && directRender) {
					// The text renderer may have centered the text block. We must calculate
					// the actual Y position of the mixed-mode text on the source canvas.
					const textRowHeight = 16; // Corresponds to font40Height in text.ts
					const canvasTextStartY = this.textRenderer.offsetY + 20 * textRowHeight * this.textRenderer.scaleY;

					// Map the destination Y to the source canvas Y for the text area
					const yOffsetInCanvas = (y - startY) / scaleY;
					srcY = Math.floor(canvasTextStartY + yOffsetInCanvas);
				} else {
					srcY = Math.floor(y / scaleY);
				}
				const srcRowOffset = srcY * srcWidth;
				const destRowOffset = y * this.targetWidth;

				for (let x = 0; x < this.targetWidth; x++) {
					// Simple nearest neighbor for X (assuming width matches for now, but safe to scale)
					// If targetWidth == srcWidth (560), this maps 1:1
					// const pixel = src32[srcRowOffset + x] ?? 0;
					const srcX = Math.floor(x / (this.targetWidth / srcWidth));
					const pixel = src32[srcRowOffset + srcX] ?? 0;
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

		// if ((globalThis as any).DEBUG_VIDEO) this.handleDebugVideo();
	}

	public drawDebugPixel(x: number, y: number, color: number) {
		if (x < 0 || x >= this.targetWidth || y < 0 || y >= this.targetHeight) return;
		this.buffer[y * this.targetWidth + x] = color;
	}

	public drawDebugChar(x: number, y: number, charCode: number, color: number) {
		for (let col = 0; col < 5; col++) {
			const pixels = getFontColumn(charCode, col);
			for (let row = 0; row < 7; row++) {
				if ((pixels >> row) & 1) {
					this.drawDebugPixel(x + col, y + row, color);
				}
			}
		}
	}

	public drawDebugString(x: number, y: number, text: string, color: number) {
		let curX = x;
		for (let i = 0; i < text.length; i++) {
			this.drawDebugChar(curX, y, text.charCodeAt(i), color);
			curX += 6; // 5 pixels width + 1 pixel spacing
		}
	}
	/*
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
*/
	public reset() {
		this.buffer.fill(0);
		if (this.ctx) this.ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
	}
}
