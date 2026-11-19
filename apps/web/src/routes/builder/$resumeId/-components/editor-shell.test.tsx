import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { use } from "react";
import { TemplateThumbnailVisibility } from "@/features/resume/editor/design/thumbnail-visibility";
import { useEditorStore } from "@/features/resume/editor/store";
import { clearPdfArtifacts } from "@/features/resume/export/pdf-artifact";
const mocks = vi.hoisted(() => ({
	layout: "desktop",
	mode: "check",
	mounts: 0,
	unmounts: 0,
	paused: vi.fn(),
	state: {
		ownerId: "owner",
		resumeId: "cv",
		acknowledgedUpdatedAt: new Date("2026-11-18"),
		editGeneration: 0,
		saveStatus: "saved",
		recoveryDraft: null as object | null,
	},
}));
vi.mock("@tanstack/react-router", async () => {
	const { useEffect } = await import("react");
	return {
		getRouteApi: () => ({ useParams: () => ({ resumeId: "cv" }), useSearch: () => ({}), useNavigate: () => vi.fn() }),
		Outlet: () => {
			useEffect(() => {
				mocks.mounts++;
				return () => {
					mocks.unmounts++;
				};
			}, []);
			return <p>Single CV preview</p>;
		},
	};
});
vi.mock("@/features/resume/builder/draft", () => ({
	useResumeStore: Object.assign((select: (state: typeof mocks.state) => unknown) => select(mocks.state), {
		getState: () => mocks.state,
		subscribe: () => () => {},
	}),
	usePreviewPausedStore: (select: (state: object) => unknown) => select({ setPaused: mocks.paused }),
}));
vi.mock("@/features/resume/editor/use-editor-mode", async () => {
	const { useState } = await import("react");
	return { useEditorMode: () => useState(mocks.mode) };
});
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => mocks.layout }));
vi.mock("@/features/resume/editor/check/use-readiness", () => ({ useReadinessLifecycle: vi.fn() }));
vi.mock("@/features/resume/editor/webmcp", () => ({ useResumeWebMcpTools: vi.fn() }));
vi.mock("@/features/resume/export/pdf-artifact", () => ({ clearPdfArtifacts: vi.fn() }));
vi.mock("@/features/resume/editor/chrome", () => ({ useIsLandscape: () => false }));
vi.mock("./design-panel", () => ({ DesignSheet: () => null }));
vi.mock("./editor-bar", () => ({ EditorBar: () => <header>Editor bar</header> }));
vi.mock("./share-sheet", () => ({ ShareSheet: () => null, SharePanel: () => null }));
vi.mock("./use-editor-hotkeys", () => ({ useEditorHotkeys: vi.fn() }));
vi.mock("./mode-panels", () => ({
	ModePanel: ({ mode }: { mode: string }) => (
		<p data-testid={`mode-${mode}`} data-thumbnails-visible={use(TemplateThumbnailVisibility)}>
			{mocks.state.saveStatus === "conflict"
				? "Resolve conflict"
				: mocks.state.recoveryDraft
					? "Recover draft"
					: "Compact summary"}
		</p>
	),
}));
vi.mock("@/features/resume/editor/check/check-panel", () => ({ CheckPanel: () => <p>Full findings</p> }));
import { EditorShell } from "./editor-shell";
beforeEach(() => {
	mocks.mounts = 0;
	mocks.unmounts = 0;
	mocks.layout = "desktop";
	mocks.mode = "check";
	mocks.state.saveStatus = "saved";
	mocks.state.recoveryDraft = null;
	useEditorStore.getState().reset();
	i18n.load("en", {});
	i18n.activate("en");
});
afterEach(cleanup);
const app = () => (
	<I18nProvider i18n={i18n}>
		<EditorShell />
	</I18nProvider>
);
it("keeps reusable PDF artifacts when the editor closes", () => {
	vi.mocked(clearPdfArtifacts).mockClear();
	const view = render(app());
	view.unmount();
	expect(clearPdfArtifacts).not.toHaveBeenCalled();
});
it.each(["desktop", "tablet", "mobile"])("gates hidden Design thumbnail work on %s", (layout) => {
	mocks.layout = layout;
	mocks.mode = "design";
	render(app());
	const panel = screen.getByTestId("mode-design");
	expect(panel).toHaveAttribute("data-thumbnails-visible", String(layout === "desktop"));
	if (layout === "tablet") {
		act(() => useEditorStore.getState().setDrawerOpen(true));
		expect(panel).toHaveAttribute("data-thumbnails-visible", "true");
	}
	act(() => useEditorStore.getState().setShareTab("download"));
	expect(panel).toHaveAttribute("data-thumbnails-visible", "false");
});
it("opens legacy check URLs directly on findings with the normal panel", () => {
	const view = render(app());
	for (const panel of screen.getAllByText("Compact summary")) expect(panel).not.toBeVisible();
	expect(screen.getByText("Full findings")).toBeVisible();
	useEditorStore.getState().setReviewExpanded(true);
	view.rerender(app());
	expect(screen.getByText("Full findings")).toBeVisible();
	expect(mocks.mounts).toBe(1);
	expect(mocks.unmounts).toBe(0);
});
it.each(["desktop", "tablet", "mobile"])("gives conflict recovery priority on %s", (layout) => {
	mocks.layout = layout;
	mocks.state.saveStatus = "conflict";
	const view = render(app());
	useEditorStore.getState().setReviewExpanded(true);
	view.rerender(app());
	expect(screen.getByText("Resolve conflict")).toBeVisible();
	expect(screen.queryByText("Full findings")).not.toBeInTheDocument();
});
it("opens mobile Review directly and pauses its hidden preview", async () => {
	mocks.layout = "mobile";
	render(app());
	await userEvent.click(screen.getByRole("button", { name: "Review" }));
	expect(screen.getByText("Full findings")).toBeVisible();
	expect(mocks.paused).toHaveBeenCalledWith(true);
	expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert");
});

it("retains the same Review panel while switching Write, Design and Review", async () => {
	mocks.layout = "mobile";
	render(app());
	const panel = screen.getByText("Full findings");
	await userEvent.click(screen.getByRole("button", { name: "Write" }));
	expect(panel).not.toBeVisible();
	await userEvent.click(screen.getByRole("button", { name: "Design" }));
	await userEvent.click(screen.getByRole("button", { name: "Review" }));
	expect(screen.getByText("Full findings")).toBe(panel);
	expect(panel).toBeVisible();
	expect(mocks.mounts).toBe(1);
	expect(mocks.unmounts).toBe(0);
});
