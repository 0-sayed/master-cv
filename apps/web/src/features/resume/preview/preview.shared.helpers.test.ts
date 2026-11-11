// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_PDF_PAGE_SIZE, getPreviewCanvasScale, getScaledPreviewPageSize } from "./preview.shared.utils";

const setDevicePixelRatio = (value: number) => {
	Object.defineProperty(window, "devicePixelRatio", {
		writable: true,
		configurable: true,
		value,
	});
};

afterEach(() => {
	setDevicePixelRatio(1);
});

describe("getPreviewCanvasScale", () => {
	it.each([1, 1.25, 2, 3])("uses device pixel ratio %s without supersampling", (ratio) => {
		setDevicePixelRatio(ratio);
		expect(getPreviewCanvasScale(595, 842)).toBe(ratio);
	});

	it("rounds CSS page dimensions consistently", () => {
		const size = getScaledPreviewPageSize(DEFAULT_PDF_PAGE_SIZE, 0.75);
		expect(size.width).toBe(446);
		expect(size.height).toBe(631);
	});

	it("clamps the scale when the page would exceed the canvas pixel budget", () => {
		setDevicePixelRatio(3);
		const scale = getPreviewCanvasScale(2000, 3000);
		// Huge pages still stay within the pixel budget.
		expect(scale).toBeLessThan(3);
		expect(scale * scale * 2000 * 3000).toBeLessThanOrEqual(16_777_216 + 1);
	});
});
