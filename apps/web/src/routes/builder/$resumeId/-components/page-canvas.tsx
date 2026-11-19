import type { EditorSelection } from "@/features/resume/editor/store";
import type { VersionSummary } from "@/features/resume/share/format";
import type { Template } from "@reactive-resume/schema/templates";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Plural, Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { cn } from "@reactive-resume/utils/style";
import { QuerySkeleton } from "@/components/query-skeleton";
import { templates } from "@/dialogs/resume/template/data";
import { useCurrentBuilderResumeSelector, useResumeData } from "@/features/resume/builder/draft";
import { CheckPageLayer } from "@/features/resume/editor/check/page-layer";
import { ParserView } from "@/features/resume/editor/check/parser-view";
import { PageViewToggle } from "@/features/resume/editor/check/review-findings";
import { CanvasStatusPill, usePageScale, ZoomBar } from "@/features/resume/editor/chrome";
import { measureOverflow, runFit } from "@/features/resume/editor/design/fit";
import { PageOverlay } from "@/features/resume/editor/page-overlay";
import { markProposals, pendingProposals } from "@/features/resume/editor/proposals/proposals";
import { useEditorStore } from "@/features/resume/editor/store";
import { useEditorMode } from "@/features/resume/editor/use-editor-mode";
import { revealSelectionInPanel } from "@/features/resume/editor/write/reveal";
import { hashPdfInput } from "@/features/resume/export/pdf-artifact";
import { ResumePreview } from "@/features/resume/preview/preview";
import { formatVersionTime, getVersionTitle } from "@/features/resume/share/format";
import { browserStorage, storageKey } from "@/libs/browser-storage";
import { orpc } from "@/libs/orpc/client";

const NONE: readonly never[] = [];

/**
 * The page canvas: the live resume on the sunken desk, with a caption above the first page, a pointer layer
 * that links lines to entries, and the zoom bar.
 */
export function PageCanvas() {
	const data = useResumeData();
	const identity = useEditorStore((state) => state.identity);
	const format = useCurrentBuilderResumeSelector((resume) => resume.data.metadata.page.format);
	const select = useEditorStore((state) => state.select);
	const setDrawerOpen = useEditorStore((state) => state.setDrawerOpen);
	const previewTemplate = useEditorStore((state) => state.previewTemplate);
	const historyVersionId = useEditorStore((state) => state.historyVersionId);
	const pageView = useEditorStore((state) => state.pageView);
	const assistantProposals = useEditorStore((state) => (state.assistantOpen ? state.assistantProposals : NONE));
	const resumeId = useCurrentBuilderResumeSelector((resume) => resume.id);
	const rendered = useEditorStore((state) => state.rendered);
	const setRendered = useEditorStore((state) => state.setRendered);
	const breakpoint = useBreakpoint();
	const [mode] = useEditorMode();
	const { canvasRef, fitScale, pageScale } = usePageScale(format);
	const isPhone = breakpoint === "mobile";

	// History: the picked version is drawn on the page, read-only, until the user restores it or goes back to now.
	const {
		data: version,
		isPending: versionPending,
		isError: versionError,
		refetch: retryVersion,
	} = useQuery({
		...orpc.resume.getVersion.queryOptions({ input: { resumeId, versionId: historyVersionId ?? "" } }),
		enabled: historyVersionId !== null,
	});
	const viewing = historyVersionId !== null && version?.id === historyVersionId ? version : null;

	const marked = assistantProposals;
	const pendingOnPage = data ? pendingProposals(data, assistantProposals).length : 0;
	const parser = mode === "check" && pageView === "parser" && !viewing;

	// Design: a hovered or focused template is drawn on the page until it's applied or the pointer leaves.
	const previewData = viewing
		? viewing.data
		: data && previewTemplate
			? { ...data, metadata: { ...data.metadata, template: previewTemplate } }
			: data && marked.length > 0
				? markProposals(data, marked)
				: undefined;
	const overflow = data && !previewTemplate && !viewing ? measureOverflow(data, rendered) : null;

	const onSelect = (selection: EditorSelection) => {
		select(selection);
		// Tablet: tapping a line opens the drawer on that entry.
		if (breakpoint === "tablet") setDrawerOpen(true);
		// Phones show the page and the panel one at a time; the selection bar opens the entry instead.
		if (mode === "write" && !isPhone) revealSelectionInPanel(selection);
	};

	const reviewFeedback = useEditorStore((state) => state.reviewFeedback);
	if (historyVersionId !== null && (versionError || (!versionPending && !viewing)))
		return (
			<div className="p-6">
				<Alert variant="error">
					<Icon name="warning-circle" />
					<AlertTitle>
						<Trans>Could not load this saved version</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>Your current CV is preserved. Try again or return to the current version.</Trans>
					</AlertDescription>
					<AlertActions>
						<Button variant="secondary" onClick={() => void retryVersion()}>
							<Trans>Try again</Trans>
						</Button>
						<Button variant="secondary" onClick={() => useEditorStore.getState().setHistoryVersion(null)}>
							<Trans>Back to current</Trans>
						</Button>
					</AlertActions>
				</Alert>
			</div>
		);
	if (historyVersionId !== null && !viewing) return <QuerySkeleton shape="preview" />;
	return (
		<div className="relative flex h-full min-h-0 flex-col bg-sunken">
			{mode === "check" && !viewing && (
				<div
					data-slot="preview-toolbar"
					className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-line bg-surface px-4 py-2"
				>
					{isPhone && (
						<Button
							variant="secondary"
							onClick={() => {
								const editor = useEditorStore.getState();
								editor.setMobileView("check");
								editor.setCheckReturnIssue(editor.checkIssue);
							}}
						>
							<Trans>Back to findings</Trans>
						</Button>
					)}
					<PageViewToggle />
				</div>
			)}
			<div className="relative min-h-0 flex-1">
				<section
					ref={canvasRef}
					data-slot="preview-scroll-area"
					// The scroll area takes focus so the page can be scrolled from the keyboard even before its lines load.
					// oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by keyboard.
					tabIndex={0}
					aria-label={t`Resume page`}
					// Tapping the page (not a line) closes the tablet drawer but keeps the selection; on phones it
					// dismisses the selection bar.
					onPointerDown={(event) => {
						if ((event.target as HTMLElement).closest("[data-kind]")) return;
						if (breakpoint === "tablet") setDrawerOpen(false);
						if (isPhone) select(null);
					}}
					className={cn("absolute inset-0 overflow-auto pt-7 pb-24 outline-none", isPhone ? "px-4" : "px-10")}
				>
					<ResumePreview
						identity={identity ?? undefined}
						highlightEdits={!viewing && !previewTemplate}
						editFeedback={reviewFeedback}
						data={previewData}
						pageLayout="vertical"
						pageGap={24}
						pageScale={pageScale}
						className={cn("mx-auto w-fit transition-transform duration-emphasized ease-enter", parser && "hidden")}
						pageClassName={cn("rounded-none shadow-page", viewing && "outline-2 outline-offset-4 outline-ink")}
						onRender={previewData ? undefined : setRendered}
						renderPageCaption={({ pageNumber }) => (
							<ResumePageCaption
								pageNumber={pageNumber}
								viewing={viewing}
								previewTemplate={previewTemplate}
								pendingOnPage={pendingOnPage}
								mode={mode}
								format={format}
								overflow={overflow}
							/>
						)}
						renderPageOverlay={({ pageIndex, pageMap }) =>
							// A version from History is read-only: its lines don't open entries.
							viewing ? null : mode === "check" ? (
								<CheckPageLayer pageIndex={pageIndex} pageMap={pageMap} />
							) : (
								<PageOverlay pageIndex={pageIndex} pageMap={pageMap} onSelect={onSelect} />
							)
						}
					/>
					{parser && <ParserView />}
				</section>

				{!parser && <ZoomBar fitScale={fitScale} pageCount={Math.max(1, rendered.pageCount)} />}
			</div>
		</div>
	);
}

type ResumePageCaptionProps = {
	pageNumber: number;
	viewing: { createdAt: Date; kind: VersionSummary["kind"]; name: VersionSummary["name"] } | null;
	previewTemplate: Template | null;
	pendingOnPage: number;
	mode: string;
	format: "a4" | "letter" | "free-form";
	overflow: ReturnType<typeof measureOverflow>;
};

/** Above the first page: the version or template being previewed, else the page label with proposals and overflow. */
function ResumePageCaption(props: ResumePageCaptionProps) {
	const { pageNumber, viewing, previewTemplate, pendingOnPage, mode, format, overflow } = props;
	const { i18n } = useLingui();
	const formatLabel = {
		a4: "A4",
		letter: t({ message: "Letter", context: "US Letter paper size (8.5 × 11 in), shown beside A4" }),
		"free-form": t`Free-form`,
	}[format];

	if (pageNumber === 1) {
		return (
			<figcaption
				data-review-page={pageNumber}
				className="mb-2.5 flex flex-wrap items-center justify-center gap-2.5 text-center text-xs font-medium text-ink-3"
			>
				{viewing ? (
					<CanvasStatusPill icon="clock-counter-clockwise">
						<Trans>
							Viewing {formatVersionTime(viewing.createdAt, i18n.locale)} · {getVersionTitle(viewing)} · read-only
						</Trans>
					</CanvasStatusPill>
				) : previewTemplate ? (
					<CanvasStatusPill icon="eye">
						<Trans>Previewing {templates[previewTemplate].name} · click to apply</Trans>
					</CanvasStatusPill>
				) : (
					<>
						{pendingOnPage > 0 ? (
							<span className="text-accent-text">
								<Plural
									value={pendingOnPage}
									one="# proposed edit on this page · nothing changes until you accept"
									other="# proposed edits on this page · nothing changes until you accept"
								/>
							</span>
						) : mode === "check" ? (
							<Trans>Page 1 · {formatLabel}</Trans>
						) : (
							<Trans>Page 1</Trans>
						)}
						{overflow && <OverflowChip {...overflow} />}
					</>
				)}
			</figcaption>
		);
	}

	// Mark only the short last page that the fit hint offers to remove.
	if (overflow && pageNumber === overflow.pageCount) {
		return (
			<figcaption data-review-page={pageNumber} className="relative mb-2.5 border-t-[1.5px] border-dashed border-warn">
				<span className="absolute end-0 -top-2.5 rounded bg-sunken px-1.5 text-[11px] font-semibold text-warn-text">
					<Trans>Page {pageNumber}</Trans>
				</span>
			</figcaption>
		);
	}

	return (
		<figcaption data-review-page={pageNumber} className="mb-2.5 text-center text-xs font-medium text-ink-3">
			<Trans>Page {pageNumber}</Trans>
		</figcaption>
	);
}

type OverflowChipProps = NonNullable<ReturnType<typeof measureOverflow>>;

/** Fit removes a short last page through the shared design compaction action. */
function OverflowChip(props: OverflowChipProps) {
	const resumeId = useCurrentBuilderResumeSelector((resume) => resume.id);
	const data = useResumeData();
	const [fitting, setFitting] = useState(false);
	const onFit = () => {
		setFitting(true);
		void runFit(props.targetPages).finally(() => setFitting(false));
	};
	const [revision, setRevision] = useState<{ data: typeof data; hash: string } | null>(null);
	useEffect(() => {
		let active = true;
		void hashPdfInput(data).then((hash) => {
			if (active) setRevision({ data, hash });
		});
		return () => {
			active = false;
		};
	}, [data]);
	if (!revision || revision.data !== data) return null;
	return (
		<DismissibleOverflowChip
			key={`${resumeId}:${revision.hash}`}
			{...props}
			resumeId={resumeId}
			revision={revision.hash}
			fitting={fitting}
			onFit={onFit}
		/>
	);
}

function DismissibleOverflowChip({
	pageCount,
	targetPages,
	lines,
	resumeId,
	revision,
	fitting,
	onFit,
}: OverflowChipProps & { resumeId: string; revision: string; fitting: boolean; onFit: () => void }) {
	const preference = storageKey("fitHintDismissed", `${resumeId}:${revision}`);
	const [dismissed, setDismissed] = useState(() => {
		try {
			return browserStorage.local.getItem(preference) === "1";
		} catch {
			return false;
		}
	});
	if (dismissed) return null;

	return (
		<span className="type-caption flex min-h-8 items-center gap-2 rounded-lg bg-warn-soft py-1 ps-3 pe-1.5 text-warn-text">
			<Icon name="square-split-horizontal" size={18} />
			<Plural
				value={lines}
				one={`The last # line spills onto page ${pageCount}`}
				other={`The last # lines spill onto page ${pageCount}`}
			/>
			<Button variant="secondary" size="sm" type="button" disabled={fitting} onClick={onFit}>
				<Plural value={targetPages} one="Fit to # page" other="Fit to # pages" />
			</Button>
			<IconButton
				size="icon"
				label={t`Dismiss page fit hint`}
				onClick={() => {
					setDismissed(true);
					try {
						browserStorage.local.setItem(preference, "1");
					} catch {
						/* Storage can be disabled in private contexts. */
					}
				}}
				icon="x"
				iconSize={16}
			/>
		</span>
	);
}
