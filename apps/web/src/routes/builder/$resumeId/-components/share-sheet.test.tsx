import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ShareSheet, SharePanel } from "./share-sheet";
import { useEditorStore } from "@/features/resume/editor/store";
const env = vi.hoisted(() => ({ breakpoint: "desktop" }));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => env.breakpoint }));
vi.mock("@/features/resume/editor/use-editor-mode", () => ({ useEditorMode: () => ["write", vi.fn()] }));
vi.mock("@/features/resume/share/download-tab", () => ({ DownloadTab: () => <p>PDF preparation</p> }));
vi.mock("@/features/resume/share/history-tab", () => ({
	HistoryTab: () => (
		<>
			<p>Saved versions</p>
			<button id="export-preview-history" onClick={() => useEditorStore.getState().setExportHistoryPreview(true)}>
				Preview version
			</button>
		</>
	),
}));
beforeEach(() => {
	useEditorStore.getState().reset();
	useEditorStore
		.getState()
		.setIdentity({ ownerId: "alice", resumeId: "resume", baseRevision: "v1", editGeneration: 1 });
	i18n.loadAndActivate({ locale: "en", messages: {} });
	env.breakpoint = "desktop";
});
afterEach(cleanup);
const renderPanels = () =>
	render(
		<I18nProvider i18n={i18n}>
			<SharePanel />
			<ShareSheet />
		</I18nProvider>,
	);
it("opens each toolbar destination in one nonmodal desktop panel", async () => {
	useEditorStore.getState().setShareTab("history");
	renderPanels();
	expect(screen.getByRole("complementary", { name: "Export and history" })).toBeVisible();
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
	await userEvent.click(screen.getByRole("tab", { name: "Download" }));
	expect(useEditorStore.getState().shareTab).toBe("download");
	expect(screen.getByText("PDF preparation")).toBeVisible();
	await userEvent.click(screen.getByRole("button", { name: "Close" }));
	expect(useEditorStore.getState().shareTab).toBeNull();
});
it("uses one labelled screen dialog on mobile", () => {
	env.breakpoint = "mobile";
	useEditorStore.getState().setShareTab("download");
	renderPanels();
	expect(screen.getAllByRole("dialog", { name: "Export and history" })).toHaveLength(1);
	expect(screen.getByRole("tab", { name: "Download" })).toHaveAttribute("aria-selected", "true");
});

it("releases the mobile modal during preview without closing the logical session", async () => {
	env.breakpoint = "mobile";
	const editor = useEditorStore.getState();
	editor.setShareTab("history");
	editor.setHistoryVersion("past");
	editor.setExportHistoryFileName("سارة");
	editor.setExportHistoryScrollTop("history", 200);
	renderPanels();
	await userEvent.click(screen.getByRole("button", { name: "Preview version" }));
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(useEditorStore.getState()).toMatchObject({
		shareTab: "history",
		historyVersionId: "past",
		exportHistorySession: { fileName: "سارة", scrollTop: { history: 200 }, previewing: true },
	});
	await import("@testing-library/react").then(({ act }) => act(() => editor.setExportHistoryPreview(false)));
	expect(await screen.findByRole("dialog", { name: "Export and history" })).toBeVisible();
	expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
	await waitFor(() => expect(screen.getByRole("button", { name: "Preview version" })).toHaveFocus());
});
