// @vitest-environment happy-dom

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act, render } from "@testing-library/react";
import { afterEach, assert, beforeEach, expect, it, vi } from "vite-plus/test";
import { PdfCanvasPage } from "./pdf-canvas";

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
	AnnotationMode: { DISABLE: 0 },
	GlobalWorkerOptions: {},
	getDocument: vi.fn(),
	RenderingCancelledException: class extends Error {},
}));

let queries: Array<{ query: string; target: EventTarget }>;
const drawImage = vi.fn();
const context = { drawImage, direction: "inherit" };
let finish: () => void;
const cancel = vi.fn();
const renderPage = vi.fn(() => ({
	promise: new Promise<void>((resolve) => {
		finish = resolve;
	}),
	cancel,
}));
const page = {
	getViewport: ({ scale }: { scale: number }) => ({ width: 595.28 * scale, height: 841.89 * scale }),
	render: renderPage,
	cleanup: vi.fn(),
};
const document = { getPage: async () => page } as unknown as PDFDocumentProxy;
const props = {
	document,
	pageNumber: 1,
	pageScale: 0.75,
	showPageNumbers: false,
	totalPages: 1,
	onLoadSuccess: vi.fn(),
};

beforeEach(() => {
	vi.useFakeTimers();
	queries = [];
	vi.stubGlobal("devicePixelRatio", 1);
	vi.stubGlobal("matchMedia", (query: string) => {
		const target = new EventTarget();
		queries.push({ query, target });
		return target;
	});
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it.each([1, 2, 3])("renders rounded CSS dimensions at DPR %s and swaps only once ready", async (ratio) => {
	vi.stubGlobal("devicePixelRatio", ratio);
	const { container } = render(<PdfCanvasPage {...props} />);
	await act(async () => {
		await vi.runOnlyPendingTimersAsync();
	});
	const canvas = container.querySelector("canvas");
	assert(canvas);
	expect(drawImage).not.toHaveBeenCalled();
	await act(async () => finish());
	expect(canvas.width).toBe(446 * ratio);
	expect(canvas.height).toBe(631 * ratio);
	expect(canvas.parentElement?.style.width).toBe("446px");
	expect(canvas.parentElement?.style.height).toBe("631px");
	expect(context.direction).toBe("ltr");
	expect(drawImage).toHaveBeenCalledTimes(1);
});

it("rerenders and rearms the resolution listener when DPR changes, retaining the old bitmap", async () => {
	const { container, unmount } = render(<PdfCanvasPage {...props} />);
	await act(async () => {
		await vi.runOnlyPendingTimersAsync();
		finish();
	});
	const canvas = container.querySelector("canvas");
	assert(canvas);
	vi.stubGlobal("devicePixelRatio", 2);
	await act(async () => {
		queries[0]?.target.dispatchEvent(new Event("change"));
	});
	await act(async () => {
		await vi.runOnlyPendingTimersAsync();
	});
	expect(canvas.width).toBe(446);
	await act(async () => finish());
	expect(canvas.width).toBe(892);
	expect(queries.map(({ query }) => query)).toEqual(["(resolution: 1dppx)", "(resolution: 2dppx)"]);
	vi.stubGlobal("devicePixelRatio", 3);
	await act(async () => {
		queries[1]?.target.dispatchEvent(new Event("change"));
	});
	await act(async () => {
		await vi.runOnlyPendingTimersAsync();
	});
	unmount();
	expect(cancel).toHaveBeenCalledTimes(1);
});
