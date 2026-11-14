import type { PageMap } from "@reactive-resume/pdf/page-map";
// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EditHighlights } from "./edit-highlights";
import { DEFAULT_PDF_PAGE_SIZE } from "./preview.shared.utils";
const mocks = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", () => ({ useReducedMotion: () => mocks.reduced }));
const map = {
	pages: [DEFAULT_PDF_PAGE_SIZE],
	nodes: [
		{
			key: "section/experience",
			kind: "section",
			sectionId: "experience",
			page: 0,
			x: 10,
			y: 20,
			width: DEFAULT_PDF_PAGE_SIZE.width,
			height: DEFAULT_PDF_PAGE_SIZE.height / 4,
		},
		{
			key: "item/one",
			kind: "item",
			sectionId: "experience",
			itemId: "one",
			page: 0,
			x: 10,
			y: 30,
			width: DEFAULT_PDF_PAGE_SIZE.width,
			height: DEFAULT_PDF_PAGE_SIZE.height / 16,
		},
		{
			key: "item/two",
			kind: "item",
			sectionId: "experience",
			itemId: "two",
			page: 0,
			x: 10,
			y: 90,
			width: DEFAULT_PDF_PAGE_SIZE.width,
			height: DEFAULT_PDF_PAGE_SIZE.height / 16,
		},
	],
} as PageMap;
const targets = [{ kind: "item" as const, sectionId: "experience", itemId: "two" }];
beforeEach(() => {
	vi.useFakeTimers();
	mocks.reduced = false;
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});
it("highlights only the accepted item after the card moment, then clears", () => {
	const { container } = render(
		<EditHighlights
			pageIndex={0}
			pageMap={map}
			targets={targets}
			feedback={{ id: "d", action: "accept", startedAt: Date.now() }}
		/>,
	);
	expect(container.querySelector('[data-slot="preview-edit-highlight"]')).toBeNull();
	act(() => vi.advanceTimersByTime(320));
	const block = container.querySelector('[data-slot="preview-edit-highlight"]');
	expect(block).toHaveAttribute("data-item-id", "two");
	expect(container.querySelectorAll('[data-slot="preview-edit-highlight"]')).toHaveLength(1);
	act(() => vi.advanceTimersByTime(1200));
	expect(container.querySelector('[data-slot="preview-edit-highlight"]')).toBeNull();
});
it("reduced motion shows a static highlight immediately and clears without animation", () => {
	mocks.reduced = true;
	const { container } = render(
		<EditHighlights
			pageIndex={0}
			pageMap={map}
			targets={targets}
			feedback={{ id: "d", action: "undo", startedAt: Date.now() }}
		/>,
	);
	expect(container.querySelector('[data-slot="preview-edit-highlight"]')).toHaveAttribute("data-motion", "static");
	act(() => vi.advanceTimersByTime(1200));
	expect(container.querySelector('[data-slot="preview-edit-highlight"]')).toBeNull();
});
it("scrolls only the preview scroller when an accepted block is offscreen", () => {
	const scroll = vi.fn();
	vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(scroll);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
		return {
			top: 0,
			bottom: this.dataset.slot === "preview-scroll-area" ? 100 : 300,
			left: 0,
			right: DEFAULT_PDF_PAGE_SIZE.width,
			width: DEFAULT_PDF_PAGE_SIZE.width,
			height: DEFAULT_PDF_PAGE_SIZE.height / 2,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		};
	});
	render(
		<div data-slot="preview-scroll-area">
			<EditHighlights
				pageIndex={0}
				pageMap={map}
				targets={targets}
				feedback={{ id: "d", action: "accept", startedAt: Date.now() - 400 }}
			/>
		</div>,
	);
	act(() => vi.advanceTimersByTime(0));
	expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
	expect(screen.queryByRole("status")).toBeNull();
});
