import type { Dict } from "@/types/dict.type";
import type { Video } from "@/types/video.interface";
import { MACHINE_STATE_OFFSET2, MACHINE_STATE_OFFSET3, REG_BORDERCOLOR_OFFSET, REG_TBCOLOR_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import type { AppleBus } from "../apple.bus";
import { RAM_OFFSET } from "../memory.consts";
import { DHGRPaletteRGB, IIgsPaletteRGB } from "./constants";
import { DebugText } from "./debug/debug.text";
import { LowGrRenderer } from "./gr";
import { HGR_COLORS, HGRRenderer } from "./hgr";
import { VideoTester } from "./tester/video.tester";
import { TextRenderer } from "./text";

// Machine State Flags (Byte 2 at MACHINE_STATE_OFFSET + 1)
const APPLE_80COL_MASK = 0b0000_0010;
const APPLE_ALTCHAR_MASK = 0b0000_0100;
const APPLE_TEXT_MASK = 0b0000_1000;
const APPLE_MIXED_MASK = 0b0001_0000;
const APPLE_PAGE2_MASK = 0b0010_0000;
const APPLE_HIRES_MASK = 0b0100_0000;
// Byte at MACHINE_STATE_OFFSET3
const APPLE_DBLRES_MASK = 0b0000_0001;
const APPLE_VIDEO7_REG_MASK = 0b0000_0110; // bits 1,2
const APPLE_VIDEO7_REG_SHIFT = 1;

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
	runTest?: string;
	isMonochrome?: boolean;
	wannaShowDebug?: boolean;
	dbgTextFgColor?: number;
	dbgTextBgColor?: number;
}

const baseurl = import.meta.url.match(/http:\/\/[^/]+/)?.[0];
function loadFont(name: string) {
	const fontUrl = new URL(`${baseurl}/fonts/${name}.ttf`).href;
	const font = new FontFace(name, `url(${fontUrl})`);
	font.load()
		.then((loaded) => {
			self.fonts.add(loaded);
			console.log("AppleVideo: Loaded font", loaded.family);
		})
		.catch((e) => console.warn("Failed to load font in worker:", e));
}

function hexToRgb(hex: string): [number, number, number] {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return [r, g, b];
}

export class AppleVideo implements Video {
	private parent: Worker;
	private buffer: Uint8Array;
	private registers: DataView;
	private ram: Uint8Array;

	private targetWidth: number;
	private targetHeight: number;

	private defaultWidth: number;
	private defaultHeight: number;

	private overrides: AppleVideoOverrides = {
		borderColor: -1,
		textFgColor: -1,
		textBgColor: -1,
	};

	private textRenderer: TextRenderer;
	private lowGrRenderer: LowGrRenderer;
	private hgrRenderer: HGRRenderer;

	private debugText: DebugText;
	private wannaShowDebug = false;

	private tester: VideoTester | undefined;

	private borderOverrideColorIdx = 0;
	private borderOverrideColorLatch = false;
	private borderColorIdx = 2;

	private renderText40!: (startRow: number, isPage2: boolean, bgIdx: number, fgIdx: number, isAltCharset: boolean) => void;
	private renderText80!: (startRow: number, bgIdx: number, fgIdx: number, isAltCharset: boolean) => void;

	constructor(parent: Worker, mem: Uint8Array, width: number, height: number, registers: DataView, ram: Uint8Array, payload?: unknown) {
		this.parent = parent;
		this.buffer = mem;
		this.registers = registers;
		this.ram = ram.subarray(RAM_OFFSET);

		this.targetWidth = width;
		this.targetHeight = height;
		this.defaultWidth = width;
		this.defaultHeight = height;

		loadFont("PrintChar21");
		loadFont("PRNumber3");

		console.log("AppleVideo", `view w${width}h${height}`);

		this.initPalette();

		this.textRenderer = new TextRenderer(this.ram, this.buffer, this.targetWidth, this.targetHeight, payload);
		this.lowGrRenderer = new LowGrRenderer(this.ram, this.buffer, this.targetWidth, this.targetHeight);
		this.hgrRenderer = new HGRRenderer(this.ram, this.buffer, this.targetWidth, this.targetHeight);
		this.debugText = new DebugText(this.buffer, this.targetWidth, this.targetHeight);

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

		// DHGR color palette (Indices 32-47)
		for (let i = 0; i < 16; i++) {
			const rgb = hexToRgb(DHGRPaletteRGB[i]!);
			const idx = 32 + i;
			palette[idx * 4 + 0] = rgb[0];
			palette[idx * 4 + 1] = rgb[1];
			palette[idx * 4 + 2] = rgb[2];
			palette[idx * 4 + 3] = 0xff;
		}
		this.parent.postMessage({ command: "setPalette", colors: palette });
	}

	public setupTests(bus: AppleBus) {
		this.tester = new VideoTester(bus, this);
	}

	public setDebugOverrides(overrides: Dict) {
		this.overrides = overrides as unknown as AppleVideoOverrides;

		if (!this.borderOverrideColorLatch) {
			if (this.borderOverrideColorIdx !== this.overrides.borderColor) {
				this.borderOverrideColorIdx = this.overrides.borderColor;
				this.borderOverrideColorLatch = true;
			}
		}

		if (this.overrides.wannaShowDebug !== this.wannaShowDebug) {
			this.wannaShowDebug = !!this.overrides.wannaShowDebug;
			this.borderOverrideColorLatch = true;
		}

		let newWidth = this.defaultWidth;
		let newHeight = this.defaultHeight;

		if (this.overrides.canvasSize === "CUSTOM" && this.overrides.customWidth && this.overrides.customHeight) {
			newWidth = this.overrides.customWidth;
			newHeight = this.overrides.customHeight;
		}

		this.textRenderer.resize(newWidth, newHeight);
		this.lowGrRenderer.resize(newWidth, newHeight);
		this.debugText.resize(newWidth, newHeight);
		// this.hgrRenderer.resize(newWidth, newHeight);

		this.updateRenderers();

		if (this.overrides.runTest && this.tester) {
			console.log("runTest", this.overrides.runTest);
			this.tester.run(this.overrides.runTest);
			return;
		}
	}

	private updateRenderers() {
		// this.textRenderer.wannaScale = !!this.overrides.wannaScale;

		if (this.overrides.textRenderer === "FONT") {
			this.renderText40 = this.textRenderer.render40WithFont.bind(this.textRenderer);
			this.renderText80 = this.textRenderer.render80WithFont.bind(this.textRenderer);
		} else {
			this.renderText40 = this.textRenderer.render40Bitmap.bind(this.textRenderer);
			this.renderText80 = this.textRenderer.render80Bitmap.bind(this.textRenderer);
		}
	}

	public tick(_meta?: unknown) {
		this.textRenderer.tick();

		const tbColor = this.registers.getUint8(REG_TBCOLOR_OFFSET);
		const bgIdx = this.overrides.textBgColor >= 0 ? this.overrides.textBgColor : tbColor & 0x0f;
		const fgIdx = this.overrides.textFgColor >= 0 ? this.overrides.textFgColor : tbColor >> 4;

		let newBorderColor = -1;
		const borderIdx = this.registers.getUint8(REG_BORDERCOLOR_OFFSET) & 0x0f;

		if (this.borderColorIdx !== borderIdx) {
			newBorderColor = borderIdx;
			this.borderColorIdx = borderIdx;
		}

		if (this.borderOverrideColorLatch) {
			this.borderOverrideColorLatch = false;
			newBorderColor = this.borderOverrideColorIdx;
			this.borderColorIdx = borderIdx;
		}

		if (newBorderColor >= 0) {
			const top = this.overrides.wannaShowDebug ? 12 : 0;
			this.debugText.drawRect(0, top, this.targetWidth, 48, newBorderColor);
			this.debugText.drawRect(0, this.targetHeight - 48, this.targetWidth, 48, newBorderColor);
			this.debugText.drawRect(0, top, 40, this.targetHeight, newBorderColor);
			this.debugText.drawRect(this.targetWidth - 40, top, 40, this.targetHeight, newBorderColor);
			// this.buffer.fill(newBorderColor);
		}

		const stateByte2 = this.registers.getUint8(MACHINE_STATE_OFFSET2);
		let isText = (stateByte2 & APPLE_TEXT_MASK) !== 0;
		let isHgr = (stateByte2 & APPLE_HIRES_MASK) !== 0;
		const isMixed = (stateByte2 & APPLE_MIXED_MASK) !== 0;
		const is80Col = (stateByte2 & APPLE_80COL_MASK) !== 0;
		let isPage2 = (stateByte2 & APPLE_PAGE2_MASK) !== 0;

		const stateByte3 = this.registers.getUint8(MACHINE_STATE_OFFSET3);
		const isDblRes = (stateByte3 & APPLE_DBLRES_MASK) !== 0;
		const video7Register = (stateByte3 & APPLE_VIDEO7_REG_MASK) >> APPLE_VIDEO7_REG_SHIFT;

		if (this.overrides.videoMode === "TEXT") {
			isText = true;
		} else if (this.overrides.videoMode === "HGR") {
			isText = false;
			isHgr = true;
		}

		if (this.overrides.videoPage === "PAGE1") isPage2 = false;
		else if (this.overrides.videoPage === "PAGE2") isPage2 = true;

		const isAltCharset = this.overrides.mouseChars === "ON" || (this.overrides.mouseChars === "OFF" ? false : (stateByte2 & APPLE_ALTCHAR_MASK) !== 0);

		if (this.overrides.wannaShowDebug) {
			this.debugText.drawRect(0, 0, this.targetWidth, 11, this.overrides.dbgTextBgColor ?? 15);
			const debugStr = `${isText ? "TEXT" : isHgr ? " HGR" : "  GR"} ${is80Col ? "80" : "40"} ${isMixed ? "MIXED" : " FULL"} ${isPage2 ? "P2" : "P1"} ${isDblRes ? "DBL" : ""}`;
			this.debugText.drawCenteredString(2, debugStr, this.overrides.dbgTextFgColor ?? 0);
		}

		if (isText) {
			if (is80Col) this.renderText80(0, bgIdx, fgIdx, isAltCharset);
			else this.renderText40(0, isPage2, bgIdx, fgIdx, isAltCharset);
			return;
		}

		if (isHgr) {
			this.hgrRenderer.render(isMixed, isPage2, isDblRes && is80Col, this.overrides.isMonochrome, video7Register);
			if (isMixed) {
				if (is80Col) this.renderText80(20, bgIdx, fgIdx, isAltCharset);
				else this.renderText40(20, isPage2, bgIdx, fgIdx, isAltCharset);
			}
			return;
		}
		this.lowGrRenderer.render(isMixed, isPage2, isDblRes);
		if (isMixed) {
			if (is80Col) this.renderText80(20, bgIdx, fgIdx, isAltCharset);
			else this.renderText40(20, isPage2, bgIdx, fgIdx, isAltCharset);
		}

		// if ((globalThis as any).DEBUG_VIDEO) this.handleDebugVideo();
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
		// if (this.ctx) this.ctx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
	}
}
