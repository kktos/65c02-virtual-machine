import type { Video } from "@/types/video.interface";
import type { AppleBus } from "../../apple.bus";
import { textScreenLineOffsets } from "../constants";
import { writeChar80, writeStr80 } from "./video.utils";

export class VideoTester {
	private timer: number | undefined = undefined;

	constructor(
		private bus: AppleBus,
		private video: Video | null,
	) {}

	public run(mode: string) {
		let duration = (16 * 1000) / 4;

		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}

		// 1. Reset to a clean state (Standard Text Mode)
		this.bus.text = true;
		this.bus.hires = false;
		this.bus.mixed = false;
		this.bus.col80 = false;
		this.bus.store80 = false;
		this.bus.page2 = false;

		// 2. Apply specific test mode
		switch (mode) {
			case "TEXT40":
				this.testText40();
				break;
			case "TEXT80":
				this.testText80();
				break;
			case "MIXED40GR":
				this.testMixed40GR();
				break;
			case "MIXED40HGR":
				this.testMixed40HGR();
				break;
			case "MIXED80GR":
				this.testMixed80GR();
				break;
			case "MIXED80HGR":
				this.testMixed80HGR();
				break;
			case "GR":
				this.testFullGR();
				break;
			case "HGR":
				this.testFullHGR();
				break;
			case "DGR":
				this.testFullDoubleGR();
				break;
			case "MIXEDDGR":
				this.testMixedDoubleGR();
				break;
			default:
				console.error("Unknown test mode:", mode);
				break;
		}

		// 3. Sync the bus state to the shared buffer so the Video Renderer sees the changes
		this.bus.syncState();

		this.timer = setInterval(() => {
			duration -= 16;
			if (duration <= 0) {
				clearInterval(this.timer);
				this.timer = undefined;
				return;
			}
			this.video?.tick();
		}, 16);
	}

	private fillPage1(start: number, end: number, valueFn: (offset: number) => number) {
		for (let i = start; i < end; i++) this.bus.write(i, valueFn(i - start));
	}

	private getHgrLineOffset(y: number): number {
		return 0x2000 + (y % 8) * 0x400 + ((y >> 3) & 7) * 0x80 + Math.floor(y / 64) * 0x28;
	}

	private testText40() {
		this.bus.text = true;
		this.bus.col80 = false;

		// Clear screen
		this.fillPage1(0x400, 0x800, () => 0xa0);

		const corner = 0x80 | "+".charCodeAt(0);
		const hLine = 0x80 | "-".charCodeAt(0);
		const vLine = 0x80 | "|".charCodeAt(0);

		for (let y = 0; y < 24; y++) {
			// biome-ignore lint/style/noNonNullAssertion: <!>
			const lineBase = textScreenLineOffsets[y]!;
			if (y === 0 || y === 23) {
				this.bus.write(lineBase, corner);
				for (let x = 1; x < 39; x++) this.bus.write(lineBase + x, hLine);
				this.bus.write(lineBase + 39, corner);
			} else {
				this.bus.write(lineBase, vLine);
				this.bus.write(lineBase + 39, vLine);
			}
		}

		const writeStr = (y: number, text: string, mode: "NORMAL" | "INVERSE" | "FLASH") => {
			// biome-ignore lint/style/noNonNullAssertion: <!>
			const lineBase = textScreenLineOffsets[y]!;
			const startX = Math.floor((40 - text.length) / 2);
			for (let i = 0; i < text.length; i++) {
				const charCode = text.charCodeAt(i) & 0x7f;
				let val = charCode;
				if (mode === "NORMAL") val |= 0x80;
				else if (mode === "INVERSE") val &= 0x3f;
				else if (mode === "FLASH") val = (val & 0x3f) | 0x40;
				this.bus.write(lineBase + startX + i, val);
			}
		};

		writeStr(10, "NORMAL TEXT", "NORMAL");
		writeStr(12, "INVERSE TEXT", "INVERSE");
		writeStr(14, "FLASHING TEXT", "FLASH");
	}

	private testText80() {
		this.bus.text = true;
		this.bus.col80 = true;
		this.bus.store80 = true; // Allow access to Aux memory via Page2 switch logic if needed

		// Clear screen
		for (let y = 0; y < 24; y++) {
			for (let c = 0; c < 80; c++) {
				writeChar80(this.bus, y, c, 0xa0); // space
			}
		}

		// Draw frame
		const corner = 0x80 | "+".charCodeAt(0);
		const hLine = 0x80 | "-".charCodeAt(0);
		const vLine = 0x80 | "|".charCodeAt(0);

		for (let y = 0; y < 24; y++) {
			if (y === 0 || y === 23) {
				writeChar80(this.bus, y, 0, corner);
				for (let c = 1; c < 79; c++) writeChar80(this.bus, y, c, hLine);
				writeChar80(this.bus, y, 79, corner);
			} else {
				writeChar80(this.bus, y, 0, vLine);
				writeChar80(this.bus, y, 79, vLine);
			}
		}

		writeStr80(this.bus, 8, "NORMAL 80-COLUMN TEXT", "NORMAL");
		writeStr80(this.bus, 10, "INVERSE 80-COLUMN TEXT", "INVERSE");
		writeStr80(this.bus, 12, "FLASHING 80-COLUMN TEXT", "FLASH");
		// This line will appear as MouseText if the ALTCHARSET flag is enabled in the debugger
		writeStr80(this.bus, 14, "THIS IS MOUSETEXT IF ALTCHARSET IS ON", "NORMAL");
	}

	private bottomText40() {
		// Draw Text Frame in the bottom 4 lines (rows 20-23)
		const corner = 0x80 | "+".charCodeAt(0);
		const hLine = 0x80 | "-".charCodeAt(0);
		const vLine = 0x80 | "|".charCodeAt(0);
		const space = 0xa0;

		const writeLine = (y: number, left: number, mid: number, right: number, text?: string) => {
			// biome-ignore lint/style/noNonNullAssertion: <!>
			const lineBase = textScreenLineOffsets[y]!;
			this.bus.write(lineBase, left);
			for (let x = 1; x < 39; x++) this.bus.write(lineBase + x, mid);
			this.bus.write(lineBase + 39, right);
			if (text) {
				const startX = Math.floor((40 - text.length) / 2);
				for (let i = 0; i < text.length; i++) {
					this.bus.write(lineBase + startX + i, 0x80 | text.charCodeAt(i));
				}
			}
		};

		writeLine(20, corner, hLine, corner);
		writeLine(21, vLine, space, vLine, "APPLE //e");
		writeLine(22, vLine, space, vLine, "MIXED GR");
		writeLine(23, corner, hLine, corner);
	}

	private bottomText80() {
		// Draw Text Frame in the bottom 4 lines (rows 20-23) for 80 columns
		const corner = 0x80 | "+".charCodeAt(0);
		const hLine = 0x80 | "-".charCodeAt(0);
		const vLine = 0x80 | "|".charCodeAt(0);
		const space = 0xa0;

		const writeLine80 = (y: number, left: number, mid: number, right: number, text?: string) => {
			writeChar80(this.bus, y, 0, left);
			for (let c = 1; c < 79; c++) writeChar80(this.bus, y, c, mid);
			writeChar80(this.bus, y, 79, right);
			if (text) {
				const startCol = Math.floor((80 - text.length) / 2);
				for (let i = 0; i < text.length; i++) {
					writeChar80(this.bus, y, startCol + i, 0x80 | text.charCodeAt(i));
				}
			}
		};

		writeLine80(20, corner, hLine, corner);
		writeLine80(21, vLine, space, vLine, "APPLE //e 80-COLUMN");
		writeLine80(22, vLine, space, vLine, "MIXED MODE TEST");
		writeLine80(23, corner, hLine, corner);
	}

	private testMixed40GR() {
		this.bus.text = false;
		this.bus.hires = false;
		this.bus.mixed = true; // Show text at bottom

		// Clear screen first (to handle holes cleanly)
		this.fillPage1(0x400, 0x800, () => 0x00);

		// Draw GR pattern (Top 20 text rows = 40 GR lines)
		for (let y = 0; y < 20; y++) {
			// biome-ignore lint/style/noNonNullAssertion: <!>
			const lineBase = textScreenLineOffsets[y]!;
			for (let x = 0; x < 40; x++) {
				const color = Math.floor(x / 2.5) % 16; // 16 colors across 40 columns
				this.bus.write(lineBase + x, (color << 4) | color);
			}
		}
		this.bottomText40();
	}

	private testMixed80GR() {
		this.bus.text = false;
		this.bus.hires = false;
		this.bus.mixed = true;
		this.bus.col80 = true;
		this.bus.store80 = true;

		// Clear screen first
		this.fillPage1(0x400, 0x800, () => 0x00);

		// Draw GR pattern (Top 20 text rows = 40 GR lines)
		for (let y = 0; y < 20; y++) {
			// biome-ignore lint/style/noNonNullAssertion: <!>
			const lineBase = textScreenLineOffsets[y]!;
			for (let x = 0; x < 40; x++) {
				const color = Math.floor(x / 2.5) % 16;
				this.bus.write(lineBase + x, (color << 4) | color);
			}
		}
		this.bottomText80();
	}

	private testFullDoubleGR() {
		this.bus.text = false;
		this.bus.hires = false;
		this.bus.mixed = false;
		this.bus.col80 = true;
		this.bus.store80 = true;
		this.bus.dblRes = true;

		this.fillPage1(0x400, 0x800, () => 0x00);

		for (let y = 0; y < 24; y++) {
			// biome-ignore lint/style/noNonNullAssertion: <!>
			const lineBase = textScreenLineOffsets[y]!;

			for (let x = 0; x < 80; x++) {
				const color = x % 16;
				const offset = Math.floor(x / 2);
				const isMain = x % 2 !== 0;

				this.bus.page2 = !isMain;
				this.bus.write(lineBase + offset, (color << 4) | color);
				this.bus.page2 = false;
			}
		}
	}

	private testMixedDoubleGR() {
		this.testFullDoubleGR();
		// Enable mixed mode
		this.bus.mixed = true;
		// Redraw bottom text area
		this.bottomText80();
	}

	private testFullGR() {
		this.bus.text = false;
		this.bus.hires = false;
		this.bus.mixed = false;

		this.fillPage1(0x400, 0x800, () => 0x00);

		for (let y = 0; y < 24; y++) {
			// biome-ignore lint/style/noNonNullAssertion: <!>
			const lineBase = textScreenLineOffsets[y]!;
			for (let x = 0; x < 40; x++) {
				const color = Math.floor(x / 2.5) % 16;
				this.bus.write(lineBase + x, (color << 4) | color);
			}
		}
	}

	private testMixed40HGR() {
		this.bus.text = false;
		this.bus.hires = true;
		this.bus.mixed = true; // Show text at bottom

		// Clear HGR Page 1 (0x2000 - 0x4000)
		this.fillPage1(0x2000, 0x4000, () => 0x00);

		// Draw a border and shapes
		const hgrLimit = 160;
		for (let y = 0; y < hgrLimit; y++) {
			const lineBase = this.getHgrLineOffset(y);
			for (let x = 0; x < 40; x++) {
				let val = 0;
				if (y === 0 || y === hgrLimit - 1 || x === 0 || x === 39)
					val = 0xff; // Border
				else if (x > 5 && x < 18 && y > 20 && y < 140)
					val = 0x2a; // Green
				else if (x > 22 && x < 35 && y > 20 && y < 140) val = 0xd5; // Orange

				if (val !== 0) this.bus.write(lineBase + x, val);
			}
		}
		this.bottomText40();
	}

	private testMixed80HGR() {
		this.bus.text = false;
		this.bus.hires = true;
		this.bus.mixed = true;
		this.bus.col80 = true;
		this.bus.store80 = true;

		this.fillPage1(0x2000, 0x4000, () => 0x00);

		const hgrLimit = 160;
		for (let y = 0; y < hgrLimit; y++) {
			const lineBase = this.getHgrLineOffset(y);
			for (let x = 0; x < 40; x++) {
				let val = 0;
				if (y === 0 || y === hgrLimit - 1 || x === 0 || x === 39) val = 0xff;
				else if (x > 5 && x < 18 && y > 20 && y < 140) val = 0x2a;
				else if (x > 22 && x < 35 && y > 20 && y < 140) val = 0xd5;

				if (val !== 0) this.bus.write(lineBase + x, val);
			}
		}
		this.bottomText80();
	}

	private testFullHGR() {
		this.bus.text = false;
		this.bus.hires = true;
		this.bus.mixed = false;

		this.fillPage1(0x2000, 0x4000, () => 0x00);

		const hgrLimit = 192;
		for (let y = 0; y < hgrLimit; y++) {
			const lineBase = this.getHgrLineOffset(y);
			for (let x = 0; x < 40; x++) {
				let val = 0;
				if (y === 0 || y === hgrLimit - 1 || x === 0 || x === 39) val = 0xff;
				else if (x > 5 && x < 18 && y > 20 && y < 170) val = 0x2a;
				else if (x > 22 && x < 35 && y > 20 && y < 170) val = 0xd5;

				if (val !== 0) this.bus.write(lineBase + x, val);
			}
		}
	}
}
