import type { ShareTab } from "@/features/resume/editor/store";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useRef, useEffect } from "react";
import { EditorPanel, EditorPanelHeader } from "@reactive-resume/ui/components/editor-panel";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Sheet, SheetContent, SheetTitle } from "@reactive-resume/ui/components/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { useEditorStore } from "@/features/resume/editor/store";
import { useEditorMode } from "@/features/resume/editor/use-editor-mode";
import { DownloadTab } from "@/features/resume/share/download-tab";
import { HistoryTab } from "@/features/resume/share/history-tab";

function ShareContent({ mobile = false }: { mobile?: boolean }) {
	const tab = useEditorStore((state) => state.shareTab);
	const setTab = useEditorStore((state) => state.setShareTab);
	const [, setMode] = useEditorMode();
	return (
		<EditorPanel className="h-full">
			<EditorPanelHeader
				title={mobile ? undefined : t`Export and history`}
				titleId="export-panel-title"
				onClose={() => setTab(null)}
				closeLabel={t`Close`}
			>
				{mobile && (
					<SheetTitle>
						<Trans>Export and history</Trans>
					</SheetTitle>
				)}
			</EditorPanelHeader>
			<Tabs
				value={tab === "history" ? "history" : "download"}
				onValueChange={(value) => {
					if (value !== "history") useEditorStore.getState().setHistoryVersion(null);
					setTab(value as ShareTab);
				}}
				className="min-h-0 flex-1 gap-0"
			>
				<TabsList variant="line" layout="equal" size="panel" aria-label={t`Share sections`}>
					<TabsTrigger value="download">
						<Icon name="download-simple" />
						<Trans>Download</Trans>
					</TabsTrigger>
					<TabsTrigger value="history">
						<Icon name="clock-counter-clockwise" />
						<Trans>History</Trans>
					</TabsTrigger>
				</TabsList>
				<TabsContent value="download" className="flex min-h-0 flex-col">
					<DownloadTab
						onReview={() => {
							useEditorStore.getState().setExportHistoryReview(true);
							setMode("check");
						}}
					/>
				</TabsContent>
				<TabsContent value="history" className="flex min-h-0 flex-col">
					<HistoryTab />
				</TabsContent>
			</Tabs>
		</EditorPanel>
	);
}

export function SharePanel() {
	const tab = useEditorStore((state) => state.shareTab);
	const breakpoint = useBreakpoint();
	if (!tab || breakpoint === "mobile" || breakpoint === "tablet") return null;
	return (
		<aside aria-labelledby="export-panel-title" className="h-full min-h-0">
			<ShareContent />
		</aside>
	);
}

export function ShareSheet() {
	const tab = useEditorStore((state) => state.shareTab);
	const breakpoint = useBreakpoint();
	const phone = breakpoint === "mobile";
	const previewing = useEditorStore((state) => state.exportHistorySession?.previewing ?? false);
	const returnFocus = useRef(false);
	useEffect(() => {
		if (previewing) returnFocus.current = true;
	}, [previewing]);
	if (breakpoint !== "mobile" && breakpoint !== "tablet") return null;
	return (
		<Sheet
			open={tab !== null && !previewing}
			onOpenChangeComplete={(open) => {
				if (open && returnFocus.current) {
					returnFocus.current = false;
					document
						.getElementById(`export-preview-${useEditorStore.getState().exportHistorySession?.tab}`)
						?.focus({ preventScroll: true });
				}
			}}
			onOpenChange={(open) => {
				if (!open && !useEditorStore.getState().exportHistorySession?.previewing)
					useEditorStore.getState().setShareTab(null);
			}}
		>
			<SheetContent
				side={phone ? "bottom" : "right"}
				size="editor"
				presentation={phone ? "screen" : "default"}
				closeLabel={t`Close`}
			>
				<ShareContent mobile />
			</SheetContent>
		</Sheet>
	);
}
