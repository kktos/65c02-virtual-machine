import { describe, expect, it } from "vitest";
import { canvasPointToBuffer } from "@/virtualmachine/video/video.output";

const view = { x: 10, y: 10, width: 100, height: 50 };

describe("canvasPointToBuffer", () => {
	it("fit mode: object-fit contain, letterboxed", () => {
		// A 400x400 box: scale 4, the picture 400x200, 100 px above and below
		const box = { width: 400, height: 400 };
		const store = { width: 100, height: 50 };
		expect(canvasPointToBuffer(0, 100, box, store, view, "fit")).toEqual({ x: 10, y: 10 });
		expect(canvasPointToBuffer(399, 299, box, store, view, "fit")).toEqual({ x: 109, y: 59 });
		expect(canvasPointToBuffer(200, 99, box, store, view, "fit")).toBeNull();
		expect(canvasPointToBuffer(200, 300, box, store, view, "fit")).toBeNull();
	});

	it("integer scaling: device pixels, centered whole multiple", () => {
		// CSS 225x150 at DPR 2: a 450x300 store, scale 4 (400x200) at x 25, y 50
		const box = { width: 225, height: 150 };
		const store = { width: 450, height: 300 };
		expect(canvasPointToBuffer(12.5, 25, box, store, view, "integer")).toEqual({ x: 10, y: 10 });
		expect(canvasPointToBuffer(12, 25, box, store, view, "integer")).toBeNull();
		expect(canvasPointToBuffer(212.4, 124.9, box, store, view, "integer")).toEqual({ x: 109, y: 59 });
		expect(canvasPointToBuffer(212.5, 100, box, store, view, "integer")).toBeNull();
	});

	it("native: one buffer pixel per CSS pixel, centered", () => {
		// CSS 225x150 at DPR 2: a 450x300 store, scale 2 (200x100) at x 125, y 100
		const box = { width: 225, height: 150 };
		const store = { width: 450, height: 300 };
		expect(canvasPointToBuffer(62.5, 50, box, store, view, "native", 2)).toEqual({ x: 10, y: 10 });
		expect(canvasPointToBuffer(62, 50, box, store, view, "native", 2)).toBeNull();
		expect(canvasPointToBuffer(162.4, 99.9, box, store, view, "native", 2)).toEqual({ x: 109, y: 59 });
		expect(canvasPointToBuffer(162.5, 50, box, store, view, "native", 2)).toBeNull();
	});

	it("native: shrinks to fit a canvas too small for it", () => {
		// CSS 50x50 at DPR 2: a 100x100 store, scale 1 (100x50) at y 25
		const box = { width: 50, height: 50 };
		const store = { width: 100, height: 100 };
		expect(canvasPointToBuffer(0, 12.5, box, store, view, "native", 2)).toEqual({ x: 10, y: 10 });
	});
});
