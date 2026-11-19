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
	preview: vi.fn(),
	version: undefined as unknown,
	versionError: false,
	versionPending: false,
	refetch: vi.fn(),
	overflow: null as { authored: number; pageCount: number; targetPages: number; lines: number } | null,
	runFit: vi.fn().mockResolvedValue("rendered"),
	dataRevision: 1,
}));
vi.mock("@/features/resume/builder/draft", async () => {
	const { defaultResumeData } = await import("@reactive-resume/schema/resume/default");
	return {
		useResumeData: () => mocks.dataRevision,
		useCurrentBuilderResumeSelector: (select: (resume: { id: string; data: typeof defaultResumeData }) => unknown) =>
			select({ id: "synthetic-cv", data: defaultResumeData }),
	};
});
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: mocks.version,
		isError: mocks.versionError,
		isPending: mocks.versionPending,
		refetch: mocks.refetch,
	}),
}));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { resume: { getVersion: { queryOptions: () => ({ queryKey: ["version"] }) } } },
}));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => "mobile" }));
vi.mock("@/features/resume/editor/use-editor-mode", () => ({ useEditorMode: () => [mocks.mode] }));
vi.mock("@/features/resume/editor/check/use-check", () => ({ useCheck: () => null }));
vi.mock("@/features/resume/editor/check/actions", () => ({ useCheckActions: () => ({}) }));
vi.mock("@/features/resume/editor/design/fit", () => ({ measureOverflow: () => mocks.overflow, runFit: mocks.runFit }));
vi.mock("@/features/resume/export/pdf-artifact", () => ({ hashPdfInput: async (data: unknown) => String(data) }));
vi.mock("@/features/resume/editor/chrome", () => ({
	usePageScale: () => ({ canvasRef: null, fitScale: 1, pageScale: 1 }),
	ZoomBar: () => null,
	CanvasStatusPill: () => null,
}));
// Isolate canvas rendering from the PDF engine; the real parser's extraction is covered in parser-view.test.tsx.
vi.mock("@/features/resume/preview/preview", () => ({
	ResumePreview: ({
		className,
		data,
		renderPageCaption,
	}: {
		className: string;
		data?: unknown;
		renderPageCaption: (page: { pageNumber: number; totalPages: number }) => ReactNode;
	}) => {
		mocks.preview(data);
		return (
			<div role="document" className={className}>
				Rendered CV
				{renderPageCaption({ pageNumber: 1, totalPages: 2 })}
			</div>
		);
	},
}));
vi.mock("@/features/resume/editor/check/parser-view", () => ({ ParserView: () => <p>Extracted PDF text</p> }));

beforeEach(() => {
	localStorage.clear();
	mocks.dataRevision = 1;
	mocks.runFit.mockClear();
	useEditorStore.getState().reset();
	mocks.mode = "check";
	mocks.overflow = null;
	mocks.version = undefined;
	mocks.versionError = false;
	mocks.versionPending = false;
	mocks.preview.mockClear();
	i18n.load("en", {});
	i18n.activate("en");
});

it("remembers dismissal for this CV revision across remounts and resets after an edit", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("en-US"));
	mocks.overflow = { authored: 1, pageCount: 3, targetPages: 2, lines: 4 };
	canvas();
	expect(await screen.findByText("The last 4 lines spill onto page 3")).toBeVisible();
	await act(async () => screen.getByRole("button", { name: "Fit to 2 pages" }).click());
	expect(mocks.runFit).toHaveBeenCalledWith(2);
	await act(async () => screen.getByRole("button", { name: "Dismiss page fit hint" }).click());
	cleanup();
	canvas();
	await act(async () => {});
	expect(screen.queryByRole("button", { name: "Dismiss page fit hint" })).toBeNull();
	cleanup();
	mocks.dataRevision++;
	canvas();
	expect(await screen.findByRole("button", { name: "Dismiss page fit hint" })).toBeVisible();
});

afterEach(cleanup);

const canvas = () =>
	render(
		<I18nProvider i18n={i18n}>
			<PageCanvas />
		</I18nProvider>,
	);

it("puts the human/parser control in the preview toolbar", () => {
	canvas();
	expect(screen.getByRole("radiogroup", { name: "Page view" }).closest('[data-slot="preview-toolbar"]')).not.toBeNull();
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

// Exercise real compiled catalogs and Latin digits, including Arabic dual/few/many forms.
it.each([
	["en-US", 1, 2, "The last 1 line spills onto page 2", "Fit to 1 page"],
	["en-US", 4, 3, "The last 4 lines spill onto page 3", "Fit to 2 pages"],
	["ar-SA", 1, 2, "آخر سطر ينتقل إلى الصفحة 2", "اجعلها 1 صفحة"],
	["ar-SA", 2, 3, "آخر سطرين ينتقلان إلى الصفحة 3", "اجعلها صفحتين"],
	["ar-SA", 4, 12, "آخر 4 أسطر تنتقل إلى الصفحة 12", "اجعلها 11 صفحة"],
	["ar-SA", 4, 4, "آخر 4 أسطر تنتقل إلى الصفحة 4", "اجعلها 3 صفحات"],
] as const)("uses plural copy and real page numbers for %s/%i/%i", async (locale, lines, pageCount, hint, action) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	mocks.overflow = { authored: 1, pageCount, targetPages: pageCount - 1, lines };
	canvas();
	expect(await screen.findByText(hint)).toBeVisible();
	expect(screen.getByRole("button", { name: action })).toBeVisible();
});

it("keeps the real CV preview unchanged when an AI proposal is selected", () => {
	useEditorStore.getState().setReviewTab("ai");
	useEditorStore.getState().setProposals([
		{
			id: "proposal",
			target: { sectionId: "summary", field: "content" },
			location: "Summary",
			before: "",
			after: "<p>Proposed wording.</p>",
			why: "Clearer wording",
			status: "pending",
			source: "improve",
		},
	]);
	canvas();
	expect(mocks.preview).toHaveBeenLastCalledWith(undefined);
	expect(screen.queryByText("Proposed wording.")).toBeNull();
});

it.each(["error", "missing", "pending"])("never renders current data for a selected snapshot with %s", (state) => {
	useEditorStore.getState().setHistoryVersion("past");
	mocks.versionError = state === "error";
	mocks.versionPending = state === "pending";
	canvas();
	expect(screen.queryByRole("document")).toBeNull();
	expect(useEditorStore.getState().historyVersionId).toBe("past");
	if (state !== "pending") {
		expect(screen.getByRole("alert")).toBeVisible();
		act(() => screen.getByRole("button", { name: "Try again" }).click());
		expect(mocks.refetch).toHaveBeenCalled();
		act(() => screen.getByRole("button", { name: "Back to current" }).click());
		expect(useEditorStore.getState().historyVersionId).toBeNull();
	}
});

it("returns from the phone preview to the selected finding through the toolbar", async () => {
	useEditorStore.getState().setCheckIssue("selected");
	useEditorStore.getState().setMobileView("page");
	canvas();
	const back = screen.getByRole("button", { name: "Back to findings" });
	expect(back.closest('[data-slot="preview-toolbar"]')).not.toBeNull();
	await act(async () => back.click());
	expect(useEditorStore.getState()).toMatchObject({
		mobileView: "check",
		checkIssue: "selected",
		checkReturnIssue: "selected",
	});
});
