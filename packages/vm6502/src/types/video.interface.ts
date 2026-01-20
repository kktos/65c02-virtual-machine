export interface Video {
	tick(): void;
	reset(): void;
	setDebugOverrides?(overrides: Record<string, unknown>): void;

	drawDebugPixel?(x: number, y: number, color: number): void;
	drawDebugChar?(x: number, y: number, charCode: number, color: number): void;
	drawDebugString?(x: number, y: number, text: string, color: number): void;
}
