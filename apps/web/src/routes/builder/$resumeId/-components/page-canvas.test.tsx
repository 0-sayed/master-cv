import type { EditorMode } from "@/features/resume/editor/store";
// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { PageCanvas } from "./page-canvas";
import { useEditorStore } from "@/features/resume/editor/store";
import { getUiLocaleMessages } from "@/libs/locale";

const mocks = vi.hoisted(() => ({
	mode: "check" as EditorMode,
	overflow: null as { authored: number; lines: number | null } | null,
}));
vi.mock("@/features/resume/builder/draft", async () => {
	const { defaultResumeData } = await import("@reactive-resume/schema/resume/default");
	return {
		useResumeData: () => defaultResumeData,
		useCurrentBuilderResumeSelector: (select: (resume: { id: string; data: typeof defaultResumeData }) => unknown) =>
			select({ id: "synthetic-cv", data: defaultResumeData }),
	};
});
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined }) }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { resume: { getVersion: { queryOptions: () => ({ queryKey: ["version"] }) } } },
}));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => "mobile" }));
vi.mock("@/features/resume/editor/use-editor-mode", () => ({ useEditorMode: () => [mocks.mode] }));
vi.mock("@/features/resume/editor/check/use-check", () => ({ useCheck: () => null }));
vi.mock("@/features/resume/editor/check/actions", () => ({ useCheckActions: () => ({}) }));
vi.mock("@/features/resume/editor/design/fit", () => ({ measureOverflow: () => mocks.overflow, runFit: vi.fn() }));
vi.mock("@/features/resume/editor/chrome", () => ({
	usePageScale: () => ({ canvasRef: null, fitScale: 1, pageScale: 1 }),
	ZoomBar: () => null,
	CanvasStatusPill: () => null,
}));
// Isolate canvas rendering from the PDF engine; the real parser's extraction is covered in parser-view.test.tsx.
vi.mock("@/features/resume/preview/preview", () => ({
	ResumePreview: ({
		className,
		renderPageCaption,
	}: {
		className: string;
		renderPageCaption: (page: { pageNumber: number; totalPages: number }) => ReactNode;
	}) => (
		<div role="document" className={className}>
			Rendered CV
			{renderPageCaption({ pageNumber: 1, totalPages: 2 })}
		</div>
	),
}));
vi.mock("@/features/resume/editor/check/parser-view", () => ({ ParserView: () => <p>Extracted PDF text</p> }));

beforeEach(() => {
	useEditorStore.getState().reset();
	mocks.mode = "check";
	mocks.overflow = null;
	i18n.load("en", {});
	i18n.activate("en");
});
afterEach(cleanup);

const canvas = () =>
	render(
		<I18nProvider i18n={i18n}>
			<PageCanvas />
		</I18nProvider>,
	);

it("shows the selected Check view without a floating switch on the canvas", () => {
	canvas();
	expect(screen.queryByRole("group", { name: "Page view" })).toBeNull();
	expect(screen.queryByRole("radiogroup", { name: "Page view" })).toBeNull();
	expect(screen.getByRole("document")).not.toHaveClass("hidden");
	expect(screen.queryByText("Extracted PDF text")).toBeNull();
	act(() => useEditorStore.getState().setPageView("parser"));
	expect(screen.getByText("Extracted PDF text")).toBeInTheDocument();
	expect(screen.getByRole("document")).toHaveClass("hidden");
	act(() => useEditorStore.getState().setPageView("page"));
	expect(screen.queryByText("Extracted PDF text")).toBeNull();
	expect(screen.getByRole("document")).not.toHaveClass("hidden");
});

it.each(["write", "design"] as const)("keeps the rendered page in %s mode after a parser selection", (mode) => {
	mocks.mode = mode;
	useEditorStore.getState().setPageView("parser");
	canvas();
	expect(screen.queryByText("Extracted PDF text")).toBeNull();
	expect(screen.getByRole("document")).not.toHaveClass("hidden");
});

// Exercise the compiled product catalogs, including page references, counts and compact captions.
it.each([
	["ar-SA", 2, "الثانية"],
	["ar-SA", 10, "العاشرة"],
	["ar-SA", 11, "11"],
	["en-US", 2, "2"],
	["en-US", 10, "10"],
	["en-US", 11, "11"],
] as const)("formats overflow page %s/%i without changing line counts or captions", async (locale, page, expected) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	mocks.overflow = { authored: page - 1, lines: 11 };
	canvas();
	expect(
		screen.getByText(
			locale === "ar-SA"
				? `يتجاوز إلى الصفحة ${expected} بنحو 11 سطرًا`
				: `Runs onto page ${expected} by about 11 lines`,
		),
	).toBeVisible();
	expect(screen.getByText(locale === "ar-SA" ? "الصفحة 1 · A4" : "Page 1 · A4")).toBeVisible();
	cleanup();
	mocks.overflow.lines = null;
	canvas();
	expect(
		screen.getByText(locale === "ar-SA" ? `يمتد إلى الصفحة ${expected}` : `Runs onto page ${expected}`),
	).toBeVisible();
});
