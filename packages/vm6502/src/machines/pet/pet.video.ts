import type { Video } from "@/types/video.interface";
import { MACHINE_STATE_OFFSET1 } from "@/virtualmachine/cpu/shared-memory";
import { CHARGEN, PET_LOWERCASE_MASK, SCREEN, SCREEN_COLS, SCREEN_ROWS } from "./pet.bus";

const BLACK = 0;
const GREEN = 1;

/**
 * The PET's 40x25 text screen: 320x200 pixels, the 8x8 characters of the character ROM (the set CA2 selects,
 * shared by the bus), bit 7 of the screen code reverses them. Green on black, as the 3032's monitor.
 */
export class PetVideo implements Video {
	constructor(
		parent: Worker,
		private readonly buffer: Uint8Array,
		private readonly width: number,
		_height: number,
		private readonly registers: DataView,
		private readonly ram: Uint8Array,
	) {
		const palette = new Uint8Array(256 * 4);
		palette.set([0x00, 0x00, 0x00, 0xff], BLACK * 4);
		palette.set([0x41, 0xff, 0x00, 0xff], GREEN * 4);
		parent.postMessage({ command: "setPalette", colors: palette });
	}

	tick() {
		const set = this.registers.getUint8(MACHINE_STATE_OFFSET1) & PET_LOWERCASE_MASK ? 0x400 : 0;
		const { buffer, ram, width } = this;
		for (let row = 0; row < SCREEN_ROWS; row++) {
			for (let col = 0; col < SCREEN_COLS; col++) {
				const code = ram[SCREEN + row * SCREEN_COLS + col] as number;
				const glyph = CHARGEN + set + (code & 0x7f) * 8;
				const reverse = code & 0x80 ? 0xff : 0x00;
				let pixel = row * 8 * width + col * 8;
				for (let line = 0; line < 8; line++, pixel += width) {
					const bits = (ram[glyph + line] as number) ^ reverse;
					for (let x = 0; x < 8; x++) buffer[pixel + x] = bits & (0x80 >> x) ? GREEN : BLACK;
				}
			}
		}
	}

	reset() {
		this.buffer.fill(BLACK);
	}
}
