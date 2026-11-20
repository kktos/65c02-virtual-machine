import type { ScreenLocation } from "@/types/video.interface";
import { NATIVE_VIEW_HEIGHT, NATIVE_VIEW_WIDTH, textScreenLineOffsets } from "./constants";
import { HGR_LINE_ADDRS } from "./hgr";

/** The aux memory, in the linear addresses (bank 1) */
const AUX = 0x10000;
/** The first picture row of the 4 text rows of a mixed screen (row 20, 16 pixels each) */
const MIXED_TEXT_TOP = 20 * 16;

/** The mode a frame is drawn in (from the soft switches and the video overrides), see `AppleVideo.tick` */
export type AppleDisplayMode = {
	isText: boolean;
	isHgr: boolean;
	isMixed: boolean;
	is80Col: boolean;
	isPage2: boolean;
	isDblRes: boolean;
};

/**
 * The memory behind the pixel (`px`, `py`) of the 560x384 picture (0,0 its top-left corner), drawn in `mode`.
 * Follows what the renderers read: the 80 columns (text, double GR, DHGR) alternate aux and main, aux first,
 * and the 80-column text and DHGR ignore PAGE2 (with 80STORE, it banks aux in instead of showing page 2).
 */
export function appleScreenToAddress(mode: AppleDisplayMode, px: number, py: number): ScreenLocation | undefined {
	if (px < 0 || py < 0 || px >= NATIVE_VIEW_WIDTH || py >= NATIVE_VIEW_HEIGHT) return undefined;

	const page = mode.isPage2 ? 2 : 1;
	// An 80-column cell (7 pixels wide): even ones in aux, odd ones in main
	const cell80 = (x: number) => {
		const cell = Math.floor(x / 7);
		return { cell, offset: cell >> 1, bank: cell & 1 ? 0 : AUX, side: cell & 1 ? "" : " (aux)" };
	};

	if (mode.isText || (mode.isMixed && py >= MIXED_TEXT_TOP)) {
		const row = py >> 4;
		const lineBase = textScreenLineOffsets[row] ?? 0;
		if (mode.is80Col) {
			const { cell, offset, bank, side } = cell80(px);
			return { address: bank + lineBase + offset, length: 1, label: `TEXT80 row ${row} · col ${cell}${side}` };
		}
		const col = Math.floor(px / 14);
		return {
			address: lineBase + (mode.isPage2 ? 0x400 : 0) + col,
			length: 1,
			label: `TEXT${page} row ${row} · col ${col}`,
		};
	}

	if (mode.isHgr) {
		const line = py >> 1;
		const lineBase = HGR_LINE_ADDRS[line] ?? 0;
		if (mode.isDblRes && mode.is80Col) {
			const { offset, bank, side } = cell80(px);
			return {
				address: bank + lineBase + offset,
				length: 1,
				label: `DHGR line ${line} · byte ${offset}${side} · bit ${px % 7}`,
			};
		}
		const dot = px >> 1;
		const byte = Math.floor(dot / 7);
		return {
			address: lineBase + (mode.isPage2 ? 0x2000 : 0) + byte,
			length: 1,
			label: `HGR${page} line ${line} · byte ${byte} · bit ${dot % 7}`,
		};
	}

	// GR: 48 lines of 8 pixels, two per text row (the low nibble on top)
	const grLine = py >> 3;
	const lineBase = (textScreenLineOffsets[grLine >> 1] ?? 0) + (mode.isPage2 ? 0x400 : 0);
	const nibble = grLine & 1 ? "bottom" : "top";
	if (mode.isDblRes) {
		const { cell, offset, bank, side } = cell80(px);
		return {
			address: bank + lineBase + offset,
			length: 1,
			label: `DGR${page} line ${grLine} · col ${cell}${side} · ${nibble}`,
		};
	}
	const col = Math.floor(px / 14);
	return { address: lineBase + col, length: 1, label: `GR${page} line ${grLine} · col ${col} · ${nibble}` };
}
