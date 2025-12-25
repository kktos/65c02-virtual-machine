export interface Video {
	tick(): void;
	reset(): void;
	setDebugOverrides?(overrides: Record<string, unknown>): void;
}
