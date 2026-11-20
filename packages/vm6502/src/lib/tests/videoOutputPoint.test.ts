import { describe, expect, it } from "vitest";
import { canvasPointToBuffer } from "@/virtualmachine/video/video.output";

const view = { x: 10, y: 10, width: 100, height: 50 };

describe("canvasPointToBuffer", () => {
	it("fit mode: object-fit contain, letterboxed", () => {
		// A 400x400 box: scale 4, the picture 400x200, 100 px above and below
		const box = { width: 400, height: 400 };
		const store = { width: 100, height: 50 };
		expect(canvasPointToBuffer(0, 100, box, store, view, false)).toEqual({ x: 10, y: 10 });
		expect(canvasPointToBuffer(399, 299, box, store, view, false)).toEqual({ x: 109, y: 59 });
		expect(canvasPointToBuffer(200, 99, box, store, view, false)).toBeNull();
		expect(canvasPointToBuffer(200, 300, box, store, view, false)).toBeNull();
	});

	it("integer scaling: device pixels, centered whole multiple", () => {
		// CSS 225x150 at DPR 2: a 450x300 store, scale 4 (400x200) at x 25, y 50
		const box = { width: 225, height: 150 };
		const store = { width: 450, height: 300 };
		expect(canvasPointToBuffer(12.5, 25, box, store, view, true)).toEqual({ x: 10, y: 10 });
		expect(canvasPointToBuffer(12, 25, box, store, view, true)).toBeNull();
		expect(canvasPointToBuffer(212.4, 124.9, box, store, view, true)).toEqual({ x: 109, y: 59 });
		expect(canvasPointToBuffer(212.5, 100, box, store, view, true)).toBeNull();
	});
});
