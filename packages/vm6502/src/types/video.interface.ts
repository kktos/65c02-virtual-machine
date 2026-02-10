import type { Dict } from "./dict.type";

export interface Video {
	tick(meta?: unknown): void;
	reset(): void;
	setDebugOverrides?(overrides: Dict): void;

	drawDebugPixel?(x: number, y: number, color: number): void;
	drawDebugChar?(x: number, y: number, charCode: number, color: number): void;
	drawDebugString?(x: number, y: number, text: string, color: number): void;
}
