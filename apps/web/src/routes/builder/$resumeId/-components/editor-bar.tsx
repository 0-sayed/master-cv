import type { EditorMode } from "@/features/resume/editor/store";
import { t } from "@lingui/core/macro";
import { ActionFeedback } from "@reactive-resume/ui/components/action-feedback";
import { Button } from "@reactive-resume/ui/components/button";
import { ButtonGroup } from "@reactive-resume/ui/components/button-group";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { DocumentMenu } from "./document-menu";
import { LocaleSwitch } from "@/features/locale/switch";
import { useCurrentResume, useResumeStore } from "@/features/resume/builder/draft";
import { BackLink, DrawerControls } from "@/features/resume/editor/chrome";
import { useEditorStore } from "@/features/resume/editor/store";
import { useResumeExport } from "@/features/resume/export/use-resume-export";

type EditorBarProps = {
	layout: "desktop" | "tablet" | "mobile";
	/** Tablet in landscape: the panel can be pinned beside the page. */
	pinnable: boolean;
};

/**
 * Shared editor bar: document, mode, history and PDF export.
 */
export function EditorBar({ layout, pinnable }: EditorBarProps) {
	const conflict = useResumeStore((state) => state.saveStatus === "conflict");

	return (
		<header className="grid h-(--editor-bar) grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-line bg-surface px-3">
			<div className="flex min-w-0 items-center gap-1.5">
				<BackLink />
				{layout === "tablet" && <DrawerControls pinnable={pinnable} />}
				<div className="flex min-w-0 flex-col items-start">
					<DocumentMenu />
				</div>
			</div>

			{layout === "mobile" ? <span /> : <ModeTabs />}

			<div className="flex items-center justify-end gap-1">
				<LocaleSwitch compact={layout !== "desktop"} />
				{layout === "desktop" && <HistoryButton />}

				<DownloadButtons compact={layout === "mobile"} iconOnly={layout === "tablet"} disabled={conflict} />
			</div>
		</header>
	);
}

const MODE_ICONS = { write: "pencil-simple", design: "palette", check: "list-checks" } as const;

function ModeTabs() {
	const labels: Record<EditorMode, string> = { write: t`Write`, design: t`Design`, check: t`Check` };

	return (
		<TabsList aria-label={t`Editor mode`} className="h-9" data-mode-switch="">
			{(Object.keys(MODE_ICONS) as EditorMode[]).map((mode) => (
				<TabsTrigger key={mode} value={mode} className="px-4">
					<Icon name={MODE_ICONS[mode]} size={18} />
					{labels[mode]}
				</TabsTrigger>
			))}
		</TabsList>
	);
}

/** History lives in the Share & export sheet; the clock opens it there. */
function HistoryButton() {
	const conflict = useResumeStore((state) => state.saveStatus === "conflict");
	const setShareTab = useEditorStore((state) => state.setShareTab);

	return (
		<IconButton
			icon="clock-counter-clockwise"
			disabled={conflict}
			label={t`History`}
			className="text-ink-2"
			onClick={() => setShareTab("history")}
		/>
	);
}

type ToolbarActionProps = {
	compact: boolean;
	disabled: boolean;
};

/** Download PDF is the only filled button; the ▾ segment opens the Download tab with every format. */
function DownloadButtons({ compact, iconOnly, disabled }: ToolbarActionProps & { iconOnly?: boolean }) {
	const resume = useCurrentResume();
	const { onDownloadPDF, isExporting, downloadState } = useResumeExport(resume);
	const setShareTab = useEditorStore((state) => state.setShareTab);

	if (compact) {
		return (
			<Button
				size="icon"
				variant="ghost"
				aria-label={t`Download PDF`}
				aria-busy={isExporting || undefined}
				disabled={disabled || isExporting}
				onClick={() => setShareTab("download")}
			>
				<ActionFeedback
					state={downloadState}
					label={t`Download PDF`}
					pendingLabel={t`Preparing…`}
					readyLabel={t`PDF ready`}
					iconOnly
				/>
			</Button>
		);
	}

	return (
		<ButtonGroup variant="split" aria-label={t`Download`}>
			{/* Tablets drop the label so the bar fits beside the mode switch; the button keeps its name. */}
			<Button
				aria-busy={isExporting || undefined}
				disabled={disabled || isExporting}
				size={iconOnly ? "icon" : "default"}
				aria-label={t`Download PDF`}
				className="gap-1.5"
				onClick={() => void onDownloadPDF()}
			>
				<ActionFeedback
					state={downloadState}
					label={t`Download PDF`}
					pendingLabel={t`Preparing…`}
					readyLabel={t`PDF ready`}
					iconOnly={iconOnly ?? false}
				/>
			</Button>
			<Button
				size={iconOnly ? "icon" : "toolbar-icon"}
				disabled={disabled || isExporting}
				aria-label={t`More download formats`}
				onClick={() => setShareTab("download")}
			>
				<Icon name="caret-down" />
			</Button>
		</ButtonGroup>
	);
}
