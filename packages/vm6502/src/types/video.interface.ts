import type { IBus } from "@/types/bus.interface";
import type { Dict } from "./dict.type";

/**
 * What the video drew at a point of the screen: the memory behind it (see `Video.screenToAddress`).
 * `address` is linear, the bank in bits 16+ (the //e's aux memory: $1xxxx), as the memory viewer has it.
 */
export type ScreenLocation = {
	address: number;
	/** How many bytes make the point (1 for a byte, a character…). */
	length: number;
	/** Where it is, for a tooltip: "HGR1 line 37 · byte 12 · bit 3". */
	label: string;
};

export interface Video {
	tick(meta?: unknown): void;
	reset(): void;
	setDebugOverrides?(overrides: Dict): void;

	setupTests?(bus: IBus): void;

	/**
	 * The memory behind the pixel (x, y) of the video buffer, as the last frame drew it (its mode, page…).
	 * Undefined outside the picture (the border). Absent: the machine doesn't map its screen.
	 */
	screenToAddress?(x: number, y: number): ScreenLocation | undefined;

	drawDebugPixel?(x: number, y: number, color: number): void;
	drawDebugChar?(x: number, y: number, charCode: number, color: number): void;
	drawDebugString?(x: number, y: number, text: string, color: number): void;
}
