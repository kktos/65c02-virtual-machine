import { describe, expect, it } from "vitest";
import { autoLayout } from "../useAppLayout";

describe("autoLayout", () => {
	// 640x480 video (4:3) under a 40px toolbar
	const aspect = 4 / 3;
	const header = 40;

	it("gives the code the whole width when the video fits in the top row", () => {
		// 480px wide -> 360px tall + 40 = 400 <= 420
		expect(autoLayout(480, 420, aspect, header)).toBe("top");
	});

	it("keeps the video full height when it is taller than the top row", () => {
		// 640px wide -> 480 + 40 = 520 > 420
		expect(autoLayout(640, 420, aspect, header)).toBe("column");
	});

	it("counts a split fitted to the video as fitting, within a pixel", () => {
		expect(autoLayout(480, 400, aspect, header)).toBe("top");
		expect(autoLayout(480, 399, aspect, header)).toBe("top");
		expect(autoLayout(480, 398, aspect, header)).toBe("column");
	});

	it("falls back to the video column before anything is measured", () => {
		expect(autoLayout(0, 0, aspect, header)).toBe("column");
		expect(autoLayout(480, 420, Number.NaN, header)).toBe("column");
	});
});
