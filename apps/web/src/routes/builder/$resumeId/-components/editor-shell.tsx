import type { EditorMode, MobileView } from "@/features/resume/editor/store";
import type { IconName } from "@reactive-resume/ui/components/icon";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getRouteApi, Outlet } from "@tanstack/react-router";
import { useEffect, useLayoutEffect } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { EditorPanelLayout } from "@reactive-resume/ui/components/editor-panel";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Tabs, TabsContent } from "@reactive-resume/ui/components/tabs";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { DesignSheet } from "./design-panel";
import { EditorBar } from "./editor-bar";
import { ModePanel } from "./mode-panels";
import { ShareSheet, SharePanel } from "./share-sheet";
import { useEditorHotkeys } from "./use-editor-hotkeys";
import { MobileTabIndicator } from "@/components/layout/mobile-tab-indicator";
import { useResumeStore, usePreviewPausedStore } from "@/features/resume/builder/draft";
import { clearCheckCache } from "@/features/resume/editor/check/check-cache";
import { CheckPanel } from "@/features/resume/editor/check/check-panel";
import { ReviewWorkspace } from "@/features/resume/editor/check/review-workspace";
import { useReadinessLifecycle } from "@/features/resume/editor/check/use-readiness";
import { useIsLandscape } from "@/features/resume/editor/chrome";
import { TemplateThumbnailVisibility } from "@/features/resume/editor/design/thumbnail-visibility";
import { useEditorStore } from "@/features/resume/editor/store";
import { useEditorMode } from "@/features/resume/editor/use-editor-mode";
import { useResumeWebMcpTools } from "@/features/resume/editor/webmcp";
import { revealSelectionInPanel } from "@/features/resume/editor/write/reveal";
import { resolveSourceSelection } from "@/features/resume/variants/source-navigation";

/**
 * The editor: a 56px bar over a resizable panel and the page canvas (desktop). On tablets the panel is a
 * drawer over the page, pinnable beside it in landscape; on phones one view shows at a time, switched by
 * Write · Page · Design · Check tabs.
 */
export function EditorShell() {
	useReadinessLifecycle();
	const [mode, setMode] = useEditorMode();
	const breakpoint = useBreakpoint();
	const layout = breakpoint === "mobile" ? "mobile" : breakpoint === "tablet" ? "tablet" : "desktop";
	const landscape = useIsLandscape();
	const pinnable = layout === "tablet" && landscape;
	const pinned = useEditorStore((state) => state.drawerPinned) && pinnable;
	const resetEditor = useEditorStore((state) => state.reset);

	useLayoutEffect(() => {
		const sync = () => {
			const state = useResumeStore.getState();
			const identity =
				state.ownerId && state.resumeId && state.acknowledgedUpdatedAt
					? {
							ownerId: state.ownerId,
							resumeId: state.resumeId,
							baseRevision: state.acknowledgedUpdatedAt.toISOString(),
							editGeneration: state.editGeneration,
						}
					: null;
			useEditorStore.getState().setIdentity(identity);
			if (state.saveStatus === "conflict" || state.recoveryDraft) {
				useEditorStore.getState().setDrawerOpen(true);
				useEditorStore.getState().setMobileView("write");
			}
		};
		sync();
		return useResumeStore.subscribe(sync);
	}, []);
	// Selection, zoom and open sheets belong to one document.
	useEffect(
		() => () => {
			clearCheckCache();
			resetEditor();
		},
		[resetEditor],
	);
	useOpenVersionFromUrl();
	useOpenSourceFromUrl();

	useResumeWebMcpTools(routeApi.useParams().resumeId);

	return (
		<Tabs
			value={mode}
			onValueChange={(value) => {
				if (value === "check") useEditorStore.getState().setReviewExpanded(true);
				setMode(value as EditorMode);
			}}
			className="contents"
		>
			<div className="grid h-svh grid-rows-[var(--editor-bar)_minmax(0,1fr)] overflow-hidden bg-bg">
				<a
					href="#main-content"
					className="sr-only rounded-md bg-raised px-4 py-2 text-sm focus:not-sr-only focus:absolute focus:inset-s-2 focus:top-2 focus:z-[100]"
				>
					<Trans>Skip to the page</Trans>
				</a>

				<EditorBar layout={layout} pinnable={pinnable} />

				<EditorBody mode={mode} layout={layout} pinned={pinned} onModeChange={setMode} />

				<ShareSheet />
				<EditorHotkeys onModeChange={setMode} />
			</div>
		</Tabs>
	);
}

const routeApi = getRouteApi("/builder/$resumeId");

/** `?version=` opens History on that version (the page shows it read-only), then leaves the URL. */
function useOpenVersionFromUrl() {
	const { version } = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	useEffect(() => {
		if (!version) return;
		const editor = useEditorStore.getState();
		editor.setShareTab("history");
		editor.setHistoryVersion(version);
		void navigate({
			to: ".",
			resetScroll: false,
			search: (current: ReturnType<typeof routeApi.useSearch>) => ({ ...current, version: undefined }),
			replace: true,
		});
	}, [version, navigate]);
}

function EditorHotkeys({ onModeChange }: { onModeChange: (mode: EditorMode) => void }) {
	useEditorHotkeys(onModeChange);
	return null;
}

function EditorBody({
	mode,
	layout,
	pinned,
	onModeChange,
}: {
	mode: EditorMode;
	layout: "desktop" | "tablet" | "mobile";
	pinned: boolean;
	onModeChange: (mode: EditorMode) => void;
}) {
	const ownerId = useResumeStore((state) => state.ownerId);
	const recovery = useResumeStore((state) => !!state.recoveryDraft || state.saveStatus === "conflict");
	const exportOpen = useEditorStore((state) => state.shareTab !== null);
	const expanded = mode === "check" && !recovery && !exportOpen;
	const requestedView = useEditorStore((state) => state.mobileView) ?? mode;
	const view = recovery ? "write" : requestedView;
	const phone = layout === "mobile";
	const exportPreview = useEditorStore((state) => state.exportHistorySession?.previewing ?? false);
	const pageVisible = exportPreview || !phone || view === "page" || view === "design";
	const drawerOpen = useEditorStore((state) => state.drawerOpen);
	const setPreviewPaused = usePreviewPausedStore((state) => state.setPaused);
	useEffect(() => {
		if (!exportPreview) return;
		const handler = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			useEditorStore.getState().setExportHistoryPreview(false);
		};
		document.addEventListener("keydown", handler, true);
		const frame = requestAnimationFrame(() => document.getElementById("export-back-to-panel")?.focus());
		return () => {
			document.removeEventListener("keydown", handler, true);
			cancelAnimationFrame(frame);
		};
	}, [exportPreview]);
	useEffect(() => {
		setPreviewPaused(!pageVisible);
		return () => setPreviewPaused(false);
	}, [pageVisible, setPreviewPaused]);
	return (
		<div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
			<EditorPanelLayout
				resizeHint={t`Drag to resize · double-click to reset`}
				ownerId={ownerId}
				enabled={layout === "desktop"}
				label={t`CV editor`}
			>
				<ReviewWorkspace
					expanded={expanded}
					phone={phone}
					pageVisible={pageVisible}
					drawer={layout === "tablet" && !pinned}
					drawerOpen={drawerOpen || recovery}
					panel={
						recovery ? (
							<ModePanel mode={mode} />
						) : (
							<>
								<div hidden={exportOpen && layout === "desktop"} className="h-full">
									<TabsContent value="write" keepMounted className="h-full overflow-y-auto">
										<ModePanel mode="write" />
									</TabsContent>
									<TabsContent value="design" keepMounted className="h-full overflow-y-auto">
										<TemplateThumbnailVisibility
											value={
												mode === "design" && !phone && !exportOpen && (layout === "desktop" || pinned || drawerOpen)
											}
										>
											<ModePanel mode="design" />
										</TemplateThumbnailVisibility>
									</TabsContent>
									<TabsContent value="check" keepMounted className="h-full">
										<CheckPanel phone={phone} active={expanded && (!phone || !pageVisible)} />
									</TabsContent>
								</div>
								{exportOpen && layout === "desktop" && <SharePanel />}
							</>
						)
					}
					preview={
						<>
							<Outlet />
							{exportPreview && (
								<div className="absolute inset-x-3 top-3 z-20">
									<Button
										id="export-back-to-panel"
										variant="secondary"
										onClick={() => useEditorStore.getState().setExportHistoryPreview(false)}
									>
										<Trans>Back to panel</Trans>
									</Button>
								</div>
							)}
							{phone && view === "design" && (
								<TemplateThumbnailVisibility value={!exportOpen}>
									<DesignSheet />
								</TemplateThumbnailVisibility>
							)}
							{phone && view === "page" && mode !== "check" && (
								<SelectionBar
									onEdit={() => {
										useEditorStore.getState().setMobileView("write");
										onModeChange("write");
									}}
								/>
							)}
						</>
					}
				/>
			</EditorPanelLayout>
			{phone && <MobileViews view={view} disabled={recovery} onModeChange={onModeChange} />}
		</div>
	);
}

const MOBILE_TABS: { view: MobileView; icon: IconName }[] = [
	{ view: "write", icon: "pencil-simple" },
	{ view: "page", icon: "file-text" },
	{ view: "design", icon: "palette" },
	{ view: "check", icon: "list-checks" },
];
function MobileViews({
	view,
	disabled,
	onModeChange,
}: {
	view: MobileView;
	disabled: boolean;
	onModeChange: (mode: EditorMode) => void;
}) {
	const labels = { write: t`Write`, page: t`Page`, design: t`Design`, check: t`Review` };
	return (
		<nav aria-label={t`Editor views`} className="flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
			{MOBILE_TABS.map(({ view: tab, icon }) => (
				<Button
					variant="ghost"
					size="mobile-nav"
					key={tab}
					type="button"
					aria-current={tab === view ? "page" : undefined}
					disabled={disabled}
					onClick={() => {
						const editor = useEditorStore.getState();
						editor.setMobileView(tab);
						if (tab === "check") editor.setReviewExpanded(true);
						if (tab !== "page") onModeChange(tab);
					}}
					className="flex-1 aria-[current]:bg-accent-soft aria-[current]:text-accent-text"
				>
					{tab === view && <MobileTabIndicator />}
					<Icon name={icon} filled={tab === view} />
					{labels[tab]}
				</Button>
			))}
		</nav>
	);
}

/** Phones: tapping a line on the page selects it and offers to edit that entry. Improve joins it in M10. */
function SelectionBar({ onEdit }: { onEdit: () => void }) {
	const selection = useEditorStore((state) => state.selection);
	if (!selection) return null;

	return (
		<div className="absolute bottom-[76px] left-1/2 z-10 flex -translate-x-1/2 items-center rounded-xl bg-ink p-1 text-bg shadow-e3 transition-[opacity,translate] duration-standard ease-enter starting:translate-y-2 starting:opacity-0">
			<button
				type="button"
				className="flex h-10 items-center gap-1.5 rounded-lg px-3 type-label font-semibold"
				onClick={() => {
					onEdit();
					revealSelectionInPanel(selection);
				}}
			>
				<Icon name="pencil-simple" size={20} />
				<Trans>Edit entry</Trans>
			</button>
		</div>
	);
}

function useOpenSourceFromUrl() {
	const { source } = routeApi.useSearch();
	useEffect(() => {
		if (!source) return;
		const data = useResumeStore.getState().resume?.data;
		if (!data) return;
		const selection = resolveSourceSelection(data, source);
		if (!selection) return;
		const editor = useEditorStore.getState();
		editor.setMobileView("write");
		editor.setDrawerOpen(true);
		revealSelectionInPanel(selection);
	}, [source]);
}
